import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { recordAuditLog } from '@/lib/utils/audit';

export const dynamic = 'force-dynamic';

// Sanitizes cell content to prevent CSV/Excel formula injection
function sanitizeCell(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv'; // 'csv', 'xlsx', 'zip', 'pdf'
    const category = searchParams.get('category') || 'all'; // 'guide', 'phd_scholar', 'all'
    const source = searchParams.get('source') || 'attendance'; // 'attendance' or 'registered'

    const admin = createAdminClient();

    let items: any[] = [];

    if (source === 'registered') {
      // 1. Fetch from people table for complete registered roster
      let peopleQuery = admin.from('people').select(`
        id,
        name,
        category,
        normalized_email,
        phd_id,
        metadata
      `);

      if (category === 'guide') {
        peopleQuery = peopleQuery.eq('category', 'guide');
      } else if (category === 'phd_scholar') {
        peopleQuery = peopleQuery.eq('category', 'phd_scholar');
      }

      peopleQuery = peopleQuery.order('category', { ascending: false }).order('name', { ascending: true });

      const { data: peopleList, error: peopleErr } = await peopleQuery;
      if (peopleErr) {
        return NextResponse.json({ error: peopleErr.message }, { status: 500 });
      }

      // Fetch attendance records and photos for these registered attendees
      const { data: attList } = await admin.from('attendance_records').select(`
        id,
        person_id,
        operation_id,
        captured_at_device,
        received_at_server,
        status,
        event_sessions (
          name,
          events (
            name,
            timezone
          )
        ),
        attendance_photos (
          storage_object_key,
          content_type,
          file_size
        )
      `);

      const attByPerson = new Map<string, any>();
      (attList || []).forEach((att) => {
        attByPerson.set(att.person_id, att);
      });

      items = (peopleList || []).map((p) => {
        const att = attByPerson.get(p.id);
        return {
          id: att?.id || `reg_${p.id}`,
          operation_id: att?.operation_id || 'REGISTERED_PENDING',
          captured_at_device: att?.captured_at_device || null,
          received_at_server: att?.received_at_server || null,
          status: att ? 'confirmed' : 'registered_pending',
          event_sessions: att?.event_sessions || { name: 'General Session', events: { name: 'MRF Research Retreat' } },
          people: p,
          attendance_photos: att?.attendance_photos || null,
        };
      });
    } else {
      // 2. Default: Fetch verified attendance check-in records
      let query = admin.from('attendance_records').select(`
        id,
        operation_id,
        captured_at_device,
        received_at_server,
        status,
        session_id,
        event_sessions (
          name,
          events (
            name,
            timezone
          )
        ),
        people!inner (
          id,
          name,
          category,
          normalized_email,
          phd_id,
          metadata
        ),
        attendance_photos (
          storage_object_key,
          content_type,
          file_size
        )
      `);

      if (category === 'guide') {
        query = query.eq('people.category', 'guide');
      } else if (category === 'phd_scholar') {
        query = query.eq('people.category', 'phd_scholar');
      }

      query = query.order('captured_at_device', { ascending: true });

      const { data: records, error } = await query;

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      items = records || [];
    }

    // Map rows for CSV / Excel
    const dataRows = items.map((r: any, idx: number) => {
      const p = r.people;
      const photo = Array.isArray(r.attendance_photos) ? r.attendance_photos[0] : r.attendance_photos;

      const email = p.normalized_email || p.metadata?.Email || p.metadata?.email || p.metadata?.['Email ID'] || p.metadata?.['Email Address'] || '';
      const phdId = p.phd_id || p.metadata?.['PhD ID'] || p.metadata?.['Ph.D ID'] || p.metadata?.USN || p.metadata?.usn || '';
      const guideName = p.metadata?.['Guide Name'] || p.metadata?.['Guide'] || p.metadata?.guide || p.metadata?.['Research Guide'] || (p.category === 'guide' ? 'Research Supervisor' : '');
      const mobile = p.metadata?.Mobile || p.metadata?.Phone || p.metadata?.phone || p.metadata?.['Contact No'] || p.metadata?.['Mobile No'] || '';
      const dept = p.metadata?.Department || p.metadata?.department || p.metadata?.Affiliation || p.metadata?.College || p.metadata?.Institution || p.metadata?.Commerce || '';
      const topic = p.metadata?.Topic || p.metadata?.topic || p.metadata?.['Research Topic'] || '';

      return {
        'S.No': idx + 1,
        'Attendance Record ID': sanitizeCell(r.id),
        'Operation ID': sanitizeCell(r.operation_id),
        'Attendee Name': sanitizeCell(p.name),
        Category: p.category === 'guide' ? 'Guide' : 'PhD Scholar',
        'Registered Identifier': sanitizeCell(p.category === 'guide' ? email : phdId),
        'Email Address': sanitizeCell(email),
        'PhD ID / USN': sanitizeCell(phdId),
        'Guide / Supervisor': sanitizeCell(guideName),
        'Mobile / Contact': sanitizeCell(mobile),
        'Department / College': sanitizeCell(dept),
        'Research Topic': sanitizeCell(topic),
        'Event Name': sanitizeCell(r.event_sessions?.events?.name || 'MRF Research Retreat'),
        'Session Name': sanitizeCell(r.event_sessions?.name || 'General Session'),
        'Local Capture Time': sanitizeCell(r.captured_at_device || 'Awaiting Check-In'),
        'Server Receipt Time': sanitizeCell(r.received_at_server || 'Awaiting Check-In'),
        'Record Status': r.status === 'confirmed' ? 'Confirmed' : 'Pending Check-In',
        'Photograph Available': photo ? 'YES' : 'NO',
        'Photo Object Key': sanitizeCell(photo?.storage_object_key || ''),
      };
    });

    // Handle CSV Format
    if (format === 'csv') {
      const worksheet = XLSX.utils.json_to_sheet(dataRows);
      const csv = XLSX.utils.sheet_to_csv(worksheet);

      await recordAuditLog({
        action: 'ATTENDANCE_EXPORTED',
        entityType: 'EXPORT',
        outcome: 'success',
        metadata: { format: 'csv', category, source, count: items.length },
      });

      const filename = `MRF_${source === 'registered' ? 'Registered_Directory' : 'Attendance'}_${category}_${new Date().toISOString().slice(0, 10)}.csv`;
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Handle Excel (.xlsx) Format
    if (format === 'xlsx') {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(dataRows);

      // Auto-adjust column widths
      worksheet['!cols'] = [
        { wch: 6 },
        { wch: 36 },
        { wch: 20 },
        { wch: 26 },
        { wch: 15 },
        { wch: 28 },
        { wch: 30 },
        { wch: 18 },
        { wch: 26 },
        { wch: 16 },
        { wch: 28 },
        { wch: 26 },
        { wch: 25 },
        { wch: 20 },
        { wch: 24 },
        { wch: 24 },
        { wch: 16 },
        { wch: 20 },
        { wch: 35 },
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, source === 'registered' ? 'Registered Attendees' : 'Attendance Records');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      await recordAuditLog({
        action: 'ATTENDANCE_EXPORTED',
        entityType: 'EXPORT',
        outcome: 'success',
        metadata: { format: 'xlsx', category, source, count: items.length },
      });

      const filename = `MRF_${source === 'registered' ? 'Registered_Directory' : 'Attendance'}_${category}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Handle PDF Format (with Photos, Names, Emails, PhD IDs, Guide Names, Affiliations, Timestamps)
    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Top Header Banner
      doc.setFillColor(20, 45, 78); // #142D4E MRF Navy
      doc.rect(0, 0, pageWidth, 26, 'F');

      // Institutional Header
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('MAHARAJA RESEARCH FOUNDATION (MRF) & MIT MYSORE', 12, 10);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(234, 242, 252);
      const subTitle =
        source === 'registered'
          ? 'MRF Research Retreat — Master Registered Scholars & Guides Directory'
          : 'MRF Research Retreat — Verified Attendance Dossier';
      doc.text(subTitle, 12, 16);

      const categoryLabel =
        category === 'guide'
          ? 'Guides Only'
          : category === 'phd_scholar'
          ? 'PhD Scholars Only'
          : 'All Scholars & Guides';

      doc.setFontSize(7.5);
      doc.setTextColor(203, 213, 225);
      doc.text(
        `Generated: ${new Date().toLocaleString()} | Filter: ${categoryLabel} | Scope: ${source === 'registered' ? 'Complete Registry' : 'Verified Attendance'} | Total Attendees: ${items.length}`,
        12,
        22
      );

      // Download photos in parallel chunks for PDF embedding
      const photoDataUrls: Record<string, string> = {};
      const PHOTO_FETCH_CONCURRENCY = 8;
      for (let i = 0; i < items.length; i += PHOTO_FETCH_CONCURRENCY) {
        const chunk = items.slice(i, i + PHOTO_FETCH_CONCURRENCY);
        await Promise.all(
          chunk.map(async (r: any) => {
            const photo = Array.isArray(r.attendance_photos) ? r.attendance_photos[0] : r.attendance_photos;
            if (photo && photo.storage_object_key) {
              try {
                const { data: fileBlob } = await admin.storage
                  .from('mrf-attendance-photos')
                  .download(photo.storage_object_key);
                if (fileBlob) {
                  const arr = await fileBlob.arrayBuffer();
                  const b64 = Buffer.from(arr).toString('base64');
                  photoDataUrls[r.id] = `data:${photo.content_type || 'image/jpeg'};base64,${b64}`;
                }
              } catch (e) {
                console.warn('PDF photo fetch warning for', r.id, e);
              }
            }
          })
        );
      }

      const tableRows = items.map((r: any, idx: number) => {
        const p = r.people;
        const photoData = photoDataUrls[r.id];

        // Format identifier and contact details
        let contactInfo = '';
        if (p.category === 'guide') {
          const email = p.normalized_email || p.metadata?.Email || p.metadata?.email || p.metadata?.['Email ID'] || '—';
          contactInfo = `Email: ${email}`;
          const mobile = p.metadata?.Mobile || p.metadata?.Phone || p.metadata?.phone || p.metadata?.['Contact No'] || p.metadata?.['Mobile No'];
          if (mobile) contactInfo += `\nMobile: ${mobile}`;
        } else {
          const phdId = p.phd_id || p.metadata?.['PhD ID'] || p.metadata?.['Ph.D ID'] || p.metadata?.USN || '—';
          contactInfo = `PhD ID: ${phdId}`;
          const email = p.normalized_email || p.metadata?.Email || p.metadata?.email || p.metadata?.['Email ID'] || p.metadata?.['Email Address'];
          if (email) contactInfo += `\nEmail: ${email}`;
          const mobile = p.metadata?.Mobile || p.metadata?.Phone || p.metadata?.phone || p.metadata?.['Contact No'] || p.metadata?.['Mobile No'];
          if (mobile) contactInfo += `\nMobile: ${mobile}`;
        }

        // Format Guide / Supervisor
        let guideInfo = '—';
        if (p.category === 'phd_scholar') {
          const gName = p.metadata?.['Guide Name'] || p.metadata?.['Guide'] || p.metadata?.guide || p.metadata?.['Research Guide'] || p.metadata?.['Supervisor'];
          guideInfo = gName ? `Guide: ${gName}` : 'Guide: Not Specified';
          const topic = p.metadata?.Topic || p.metadata?.topic || p.metadata?.['Research Topic'];
          if (topic) guideInfo += `\nTopic: ${topic}`;
        } else {
          guideInfo = 'Role: Research Guide';
        }

        // Format Department / Affiliation
        const dept =
          p.metadata?.Department ||
          p.metadata?.department ||
          p.metadata?.Affiliation ||
          p.metadata?.College ||
          p.metadata?.Institution ||
          p.metadata?.Commerce ||
          'MRF / MIT Mysore';

        // Format Attendance status and timestamp
        let statusDisplay = '';
        if (r.captured_at_device) {
          const formattedTime = new Date(r.captured_at_device).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          statusDisplay = `${formattedTime}\nConfirmed`;
        } else {
          statusDisplay = 'Pending Check-In';
        }

        return [
          String(idx + 1),
          photoData || '',
          p.name || 'Unknown',
          p.category === 'guide' ? 'Guide' : 'PhD Scholar',
          contactInfo,
          guideInfo,
          dept,
          statusDisplay,
        ];
      });

      const autoTableFunc = (autoTable as any).default || autoTable;
      autoTableFunc(doc, {
        startY: 30,
        margin: { left: 12, right: 12 },
        tableWidth: 273,
        head: [['#', 'Photo', 'Attendee Name', 'Category', 'Identifier & Contact', 'Research Guide / Topic', 'Department / Institution', 'Check-In Status']],
        body: tableRows.map((r) => [r[0], '', r[2], r[3], r[4], r[5], r[6], r[7]]),
        theme: 'grid',
        headStyles: {
          fillColor: [20, 45, 78], // #142D4E
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'center',
          valign: 'middle',
        },
        styles: {
          fontSize: 7,
          minCellHeight: 22,
          valign: 'middle',
          textColor: [24, 34, 48],
          cellPadding: 2,
          overflow: 'linebreak',
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 24, halign: 'center' },
          2: { cellWidth: 38, fontStyle: 'bold' },
          3: { cellWidth: 22, halign: 'center' },
          4: { cellWidth: 54 },
          5: { cellWidth: 46 },
          6: { cellWidth: 45 },
          7: { cellWidth: 36, halign: 'center', fontStyle: 'bold' },
        },
        didDrawCell: (data: any) => {
          if (data.column.index === 1 && data.cell.section === 'body') {
            const photo = tableRows[data.row.index]?.[1];
            if (photo && photo.startsWith('data:image')) {
              try {
                const imgType = photo.includes('png') ? 'PNG' : 'JPEG';
                doc.addImage(photo, imgType, data.cell.x + 2.5, data.cell.y + 1.5, 19, 19);
              } catch (e) {
                doc.setFillColor(241, 245, 249);
                doc.roundedRect(data.cell.x + 2.5, data.cell.y + 1.5, 19, 19, 1, 1, 'F');
                doc.setFontSize(6);
                doc.setTextColor(148, 163, 184);
                doc.text('Photo Error', data.cell.x + 12, data.cell.y + 11, { align: 'center' });
              }
            } else {
              doc.setFillColor(248, 250, 252);
              doc.roundedRect(data.cell.x + 2.5, data.cell.y + 1.5, 19, 19, 1, 1, 'F');
              doc.setFontSize(6);
              doc.setTextColor(156, 163, 175);
              doc.text('No Photo', data.cell.x + 12, data.cell.y + 11, { align: 'center' });
            }
          }
        },
        didDrawPage: () => {
          const pageNum = doc.getNumberOfPages();
          doc.setFontSize(7.5);
          doc.setTextColor(102, 112, 133);
          doc.text(
            `Maharaja Research Foundation — Official Audit Docket | Page ${pageNum}`,
            12,
            pageHeight - 5
          );
          doc.text(
            'Confidential — For Authorized Institutional & Audit Use Only',
            pageWidth - 85,
            pageHeight - 5
          );
        },
      });

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

      await recordAuditLog({
        action: 'ATTENDANCE_EXPORTED',
        entityType: 'EXPORT',
        outcome: 'success',
        metadata: { format: 'pdf', category, source, count: items.length },
      });

      const filename = `MRF_${source === 'registered' ? 'Registered_Directory' : 'Attendance'}_${category}_${new Date().toISOString().slice(0, 10)}.pdf`;
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Handle ZIP Format (Photos + Manifest + README)
    if (format === 'zip') {
      const zip = new JSZip();
      const photosFolder = zip.folder('photos');

      // 1. Generate Manifest
      const manifestRows = items.map((r: any) => {
        const p = r.people;
        const photo = Array.isArray(r.attendance_photos) ? r.attendance_photos[0] : r.attendance_photos;
        const filename = photo ? `${r.operation_id}.jpg` : 'NO_PHOTO';

        return {
          'Attendance Record ID': sanitizeCell(r.id),
          'Operation ID': sanitizeCell(r.operation_id),
          'Attendee Name': sanitizeCell(p.name),
          Category: p.category === 'guide' ? 'Guide' : 'PhD Scholar',
          'Registered Identifier': sanitizeCell(p.category === 'guide' ? p.normalized_email : p.phd_id),
          'Captured Timestamp': sanitizeCell(r.captured_at_device),
          'Photo Filename': filename,
          'Storage Key': sanitizeCell(photo?.storage_object_key || ''),
        };
      });

      const manifestSheet = XLSX.utils.json_to_sheet(manifestRows);
      const manifestCsv = XLSX.utils.sheet_to_csv(manifestSheet);
      zip.file('manifest.csv', manifestCsv);

      // 2. Add README
      zip.file(
        'README.txt',
        `MAHARAJA RESEARCH FOUNDATION (MRF) - ATTENDANCE PHOTOGRAPHS ARCHIVE
Generated: ${new Date().toISOString()}
Total Records: ${items.length}

Structure:
- manifest.csv: Maps attendee metadata, identifiers, and timestamps to photo filenames.
- /photos: Contains high-resolution JPG images captured during attendance verification. Filename format: <operation_id>.jpg

Confidential. For authorized institutional use only.`
      );

      // 3. Concurrently fetch and zip photographs
      const PHOTO_FETCH_CONCURRENCY = 10;
      for (let i = 0; i < items.length; i += PHOTO_FETCH_CONCURRENCY) {
        const chunk = items.slice(i, i + PHOTO_FETCH_CONCURRENCY);
        await Promise.all(
          chunk.map(async (r: any) => {
            const photo = Array.isArray(r.attendance_photos) ? r.attendance_photos[0] : r.attendance_photos;
            if (photo && photo.storage_object_key) {
              try {
                const { data: fileBlob } = await admin.storage
                  .from('mrf-attendance-photos')
                  .download(photo.storage_object_key);

                if (fileBlob) {
                  const arr = await fileBlob.arrayBuffer();
                  photosFolder?.file(`${r.operation_id}.jpg`, arr);
                }
              } catch (e) {
                console.warn('Failed to fetch photo from storage for ZIP archive:', photo.storage_object_key, e);
              }
            }
          })
        );
      }

      const zipBlob = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

      await recordAuditLog({
        action: 'ATTENDANCE_EXPORTED',
        entityType: 'EXPORT',
        outcome: 'success',
        metadata: { format: 'zip', category, count: items.length },
      });

      const filename = `MRF_Attendance_Photos_${category}_${new Date().toISOString().slice(0, 10)}.zip`;
      return new NextResponse(zipBlob as any, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ error: 'Unsupported export format.' }, { status: 400 });
  } catch (error: any) {
    console.error('Export generation error:', error);
    return NextResponse.json({ error: error.message || 'Export generation failed.' }, { status: 500 });
  }
}
