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

    const admin = createAdminClient();

    // 1. Fetch attendance records joined with people, session, event, and photo
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

    const items = records || [];

    // Map rows for CSV / Excel
    const dataRows = items.map((r: any, idx: number) => {
      const p = r.people;
      const photo = Array.isArray(r.attendance_photos) ? r.attendance_photos[0] : r.attendance_photos;
      return {
        'S.No': idx + 1,
        'Attendance Record ID': sanitizeCell(r.id),
        'Operation ID': sanitizeCell(r.operation_id),
        'Attendee Name': sanitizeCell(p.name),
        Category: p.category === 'guide' ? 'Guide' : 'PhD Scholar',
        'Registered Identifier': sanitizeCell(p.category === 'guide' ? p.normalized_email : p.phd_id),
        'Event Name': sanitizeCell(r.event_sessions?.events?.name || 'MRF Research Retreat'),
        'Session Name': sanitizeCell(r.event_sessions?.name || 'General Session'),
        'Local Capture Time (ISO)': sanitizeCell(r.captured_at_device),
        'Server Receipt Time (ISO)': sanitizeCell(r.received_at_server),
        'Record Status': sanitizeCell(r.status),
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
        metadata: { format: 'csv', category, count: items.length },
      });

      const filename = `MRF_Attendance_${category}_${new Date().toISOString().slice(0, 10)}.csv`;
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
        { wch: 38 },
        { wch: 38 },
        { wch: 25 },
        { wch: 15 },
        { wch: 28 },
        { wch: 30 },
        { wch: 25 },
        { wch: 26 },
        { wch: 26 },
        { wch: 14 },
        { wch: 18 },
        { wch: 35 },
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Records');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      await recordAuditLog({
        action: 'ATTENDANCE_EXPORTED',
        entityType: 'EXPORT',
        outcome: 'success',
        metadata: { format: 'xlsx', category, count: items.length },
      });

      const filename = `MRF_Attendance_${category}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Handle PDF Format (with Photos, Names, Emails, PhD IDs, Affiliations, Sessions, Timestamps)
    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Top Header Banner
      doc.setFillColor(20, 45, 78); // #142D4E
      doc.rect(0, 0, pageWidth, 28, 'F');

      // Title & Subtitle
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('MAHARAJA RESEARCH FOUNDATION (MRF) & MIT MYSORE', 14, 11);

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(234, 242, 252);
      doc.text('MRF Research Retreat — Verified Attendance Dossier', 14, 18);

      const categoryLabel =
        category === 'guide'
          ? 'Guides Only'
          : category === 'phd_scholar'
          ? 'PhD Scholars Only'
          : 'All Verified Attendees';

      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text(
        `Generated: ${new Date().toLocaleString()} | Filter: ${categoryLabel} | Total Records: ${items.length}`,
        14,
        24
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

        let identifierDisplay = '';
        if (p.category === 'guide') {
          identifierDisplay = p.normalized_email || '—';
        } else {
          identifierDisplay = `ID: ${p.phd_id || '—'}`;
          let email = p.normalized_email;
          if (!email && p.metadata) {
            email = p.metadata.Email || p.metadata.email || null;
          }
          if (email) {
            identifierDisplay += `\n${email}`;
          }
        }

        const dept =
          p.metadata?.Department ||
          p.metadata?.department ||
          p.metadata?.Affiliation ||
          p.metadata?.College ||
          p.metadata?.Institution ||
          '—';

        const checkInTime = new Date(r.captured_at_device).toLocaleString([], {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        return [
          String(idx + 1),
          photoData || '',
          p.name || 'Unknown',
          p.category === 'guide' ? 'Guide' : 'PhD Scholar',
          identifierDisplay,
          dept,
          checkInTime,
          'Confirmed',
        ];
      });

      const autoTableFunc = (autoTable as any).default || autoTable;
      autoTableFunc(doc, {
        startY: 33,
        margin: { left: 14, right: 14 },
        tableWidth: 269,
        head: [['#', 'Photo', 'Attendee Name', 'Category', 'Email / PhD ID', 'Affiliation / Dept', 'Check-In Time', 'Status']],
        body: tableRows.map((r) => [r[0], '', r[2], r[3], r[4], r[5], r[6], r[7]]),
        theme: 'grid',
        headStyles: {
          fillColor: [40, 100, 180], // #2864B4
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8.5,
          halign: 'center',
          valign: 'middle',
        },
        styles: {
          fontSize: 8,
          minCellHeight: 18,
          valign: 'middle',
          textColor: [24, 34, 48],
          cellPadding: 2,
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 20, halign: 'center' },
          2: { cellWidth: 42, fontStyle: 'bold' },
          3: { cellWidth: 25, halign: 'center' },
          4: { cellWidth: 52 },
          5: { cellWidth: 46 },
          6: { cellWidth: 48 },
          7: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
        },
        didDrawCell: (data: any) => {
          if (data.column.index === 1 && data.cell.section === 'body') {
            const photo = tableRows[data.row.index]?.[1];
            if (photo && photo.startsWith('data:image')) {
              try {
                doc.addImage(photo, 'JPEG', data.cell.x + 2.5, data.cell.y + 1, 15, 15);
              } catch (e) {
                doc.setFontSize(7);
                doc.setTextColor(150, 150, 150);
                doc.text('Image Error', data.cell.x + 3, data.cell.y + 9);
              }
            } else {
              doc.setFontSize(7);
              doc.setTextColor(150, 150, 150);
              doc.text('No Photo', data.cell.x + 4, data.cell.y + 9);
            }
          }
        },
        didDrawPage: () => {
          const pageNum = doc.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(102, 112, 133);
          doc.text(
            `Maharaja Research Foundation — Official Audit Docket | Page ${pageNum}`,
            14,
            pageHeight - 6
          );
          doc.text(
            'Confidential — For Authorized Institutional Use Only',
            pageWidth - 85,
            pageHeight - 6
          );
        },
      });

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

      await recordAuditLog({
        action: 'ATTENDANCE_EXPORTED',
        entityType: 'EXPORT',
        outcome: 'success',
        metadata: { format: 'pdf', category, count: items.length },
      });

      const filename = `MRF_Attendance_${category}_${new Date().toISOString().slice(0, 10)}.pdf`;
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
        const filename = photo ? `${r.id}.jpg` : 'NO_PHOTO';
        return {
          'Record ID': sanitizeCell(r.id),
          'Operation ID': sanitizeCell(r.operation_id),
          Category: p.category,
          Identifier: sanitizeCell(p.category === 'guide' ? p.normalized_email : p.phd_id),
          'Attendee Name': sanitizeCell(p.name),
          'Photo Filename': filename,
          'Capture Time': sanitizeCell(r.captured_at_device),
          'Server Receipt Time': sanitizeCell(r.received_at_server),
        };
      });

      const manifestWs = XLSX.utils.json_to_sheet(manifestRows);
      const manifestCsv = XLSX.utils.sheet_to_csv(manifestWs);
      zip.file('manifest.csv', manifestCsv);

      // 2. Add README
      const readmeContent = `MAHARAJA RESEARCH FOUNDATION (MRF)
EVENT ATTENDANCE PHOTOGRAPHS & AUDIT EXPORT
Generated: ${new Date().toISOString()}
Attendee Category Filter: ${category}
Total Attendance Records: ${items.length}

SECURITY & RETENTION NOTICE:
This archive contains private attendee photographs captured at the MRF attendance kiosk.
Access is strictly restricted to authorized MRF administrators.
Do not distribute or share these images outside authorized institutional workflows.
`;
      zip.file('README.txt', readmeContent);

      // 3. Download and package photos from Supabase Storage in parallel chunks
      const PHOTO_CHUNK_SIZE = 12;
      for (let i = 0; i < items.length; i += PHOTO_CHUNK_SIZE) {
        const chunk = items.slice(i, i + PHOTO_CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (r) => {
            const photo = Array.isArray(r.attendance_photos) ? r.attendance_photos[0] : r.attendance_photos;
            if (photo && photo.storage_object_key) {
              try {
                const { data: fileBlob, error: downloadErr } = await admin.storage
                  .from('mrf-attendance-photos')
                  .download(photo.storage_object_key);

                if (fileBlob && !downloadErr) {
                  const arrayBuf = await fileBlob.arrayBuffer();
                  photosFolder?.file(`${r.id}.jpg`, arrayBuf);
                }
              } catch (e) {
                console.warn(`Could not include photo for record ${r.id}:`, e);
              }
            }
          })
        );
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      await recordAuditLog({
        action: 'ATTENDANCE_EXPORTED',
        entityType: 'EXPORT',
        outcome: 'success',
        metadata: { format: 'zip', category, count: items.length },
      });

      const filename = `MRF_Attendance_Photos_${category}_${new Date().toISOString().slice(0, 10)}.zip`;
      return new NextResponse(zipBuffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ error: 'Unsupported export format.' }, { status: 400 });
  } catch (err: any) {
    console.error('Export error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
