import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { recordAuditLog } from '@/lib/utils/audit';
import { requireStaff } from '@/lib/auth/requireAdmin';
import { isTeacher } from '@/lib/auth/staffScope';
import { getEventRoomFor, getStaffEventRooms, resolveEventRoom } from '@/lib/staff/eventRoom';

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
  const auth = await requireStaff();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv'; // 'csv', 'xlsx', 'zip', 'pdf'
    const category = searchParams.get('category') || 'all'; // 'guide', 'phd_scholar', 'all'
    const source = searchParams.get('source') || 'attendance'; // 'attendance' or 'registered'
    const roomFilter = (searchParams.get('event_room') || '').replace(/\s+/g, ' ').trim(); // '' = every event / room

    const admin = createAdminClient();
    // Teachers can only export the students and check-ins they registered.
    const onlyMine = isTeacher(auth.admin) ? (auth.admin.id as string) : null;

    let items: any[] = [];

    if (source === 'registered') {
      // 1. Fetch from people table for complete registered roster
      let peopleQuery = admin.from('people').select(`
        id,
        name,
        category,
        normalized_email,
        phd_id,
        college,
        metadata,
        registered_by
      `);

      if (category === 'guide') {
        peopleQuery = peopleQuery.eq('category', 'guide');
      } else if (category === 'phd_scholar') {
        peopleQuery = peopleQuery.eq('category', 'phd_scholar');
      } else if (category === 'student') {
        peopleQuery = peopleQuery.eq('category', 'student');
      }

      if (onlyMine) peopleQuery = peopleQuery.eq('registered_by', onlyMine);
      peopleQuery = peopleQuery.order('category', { ascending: false }).order('name', { ascending: true });

      const { data: peopleList, error: peopleErr } = await peopleQuery;
      if (peopleErr) {
        return NextResponse.json({ error: peopleErr.message }, { status: 500 });
      }

      // Fetch attendance records and photos for these registered attendees
      let attListQuery = admin.from('attendance_records').select(`
        id,
        person_id,
        registered_by,
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
      if (onlyMine) attListQuery = attListQuery.eq('registered_by', onlyMine);
      const { data: attList } = await attListQuery;

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
          event_sessions: att?.event_sessions || { name: 'General Session', events: { name: 'MIT Mysore Student Attendance' } },
          registered_by: att?.registered_by ?? (p as any).registered_by ?? null,
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
        registered_by,
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
          college,
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
      } else if (category === 'student') {
        query = query.eq('people.category', 'student');
      }

      if (onlyMine) query = query.eq('registered_by', onlyMine);
      query = query.order('captured_at_device', { ascending: true });

      const { data: records, error } = await query;

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      items = records || [];
    }

    // Event / Room of every row, then keep only the chosen one (if any)
    const [eventRooms, myRoom] = await Promise.all([
      getStaffEventRooms(admin),
      getEventRoomFor(admin, auth.admin.id as string),
    ]);
    items = items.map((r: any) => ({ ...r, event_room: resolveEventRoom(r.people?.metadata, r.registered_by, eventRooms) }));
    if (roomFilter) {
      const want = roomFilter.toLowerCase();
      items = items.filter((r: any) => String(r.event_room).toLowerCase() === want);
    }
    const roomsInExport = Array.from(new Set(items.map((r: any) => r.event_room as string)));
    const eventRoomLabel =
      roomFilter ||
      (roomsInExport.length === 1 ? roomsInExport[0] : roomsInExport.length === 0 ? myRoom || 'All events / rooms' : 'All events / rooms');
    const fileTag = eventRoomLabel === 'All events / rooms' ? '' : `_${eventRoomLabel.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}`;

    // Map rows for CSV / Excel
    const dataRows = items.map((r: any, idx: number) => {
      const p = r.people;
      const photo = Array.isArray(r.attendance_photos) ? r.attendance_photos[0] : r.attendance_photos;

      return {
        'S.No': idx + 1,
        'Attendance Record ID': sanitizeCell(r.id),
        'Operation ID': sanitizeCell(r.operation_id),
        'Student Name': sanitizeCell(p.name),
        'College Name': sanitizeCell((p.college || p.metadata?.College || p.metadata?.Institution || '')),
        'Event / Room': sanitizeCell(r.event_room),
        'Event Name': sanitizeCell(r.event_sessions?.events?.name || 'MIT Mysore Student Attendance'),
        'Session Name': sanitizeCell(r.event_sessions?.name || 'General Session'),
        'Local Capture Time': sanitizeCell(r.captured_at_device || 'Not Yet Checked In'),
        'Server Receipt Time': sanitizeCell(r.received_at_server || 'Not Yet Checked In'),
        'Record Status': r.status === 'confirmed' ? 'Confirmed' : 'Not Yet Checked In',
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

      const filename = `MITM_Students_${source === 'registered' ? 'Registered_Directory' : 'Attendance'}${fileTag}_${new Date().toISOString().slice(0, 10)}.csv`;
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
        { wch: 28 },
        { wch: 28 },
        { wch: 28 },
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

      const filename = `MITM_Students_${source === 'registered' ? 'Registered_Directory' : 'Attendance'}${fileTag}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Handle PDF Format (with photos, student names, colleges and check-in times)
    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Top Header Banner
      doc.setFillColor(20, 45, 78); // #142D4E navy
      doc.rect(0, 0, pageWidth, 34, 'F');

      // Institutional Header
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('MIT MYSORE STUDENT ATTENDANCE TRACKER', 12, 10);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(234, 242, 252);
      const subTitle =
        source === 'registered'
          ? 'Registered Students Directory'
          : 'Verified Student Attendance Report';
      doc.text(subTitle, 12, 16);

      // Which event / room this PDF is for
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 215, 106); // gold
      doc.text(`Event / Room: ${eventRoomLabel}`, 12, 23);
      doc.setFont('helvetica', 'normal');

      doc.setFontSize(7.5);
      doc.setTextColor(203, 213, 225);
      doc.text(
        `Generated: ${new Date().toLocaleString()} | Scope: ${source === 'registered' ? 'All Registered Students' : 'Verified Attendance'} | Total Students: ${items.length}`,
        12,
        29.5
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

        const college = (p.college || p.metadata?.College || p.metadata?.Institution || '') || '—';

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
          statusDisplay = 'Not Yet Checked In';
        }

        return [
          String(idx + 1),
          photoData || '',
          p.name || 'Unknown',
          college,
          statusDisplay,
        ];
      });

      const autoTableFunc = (autoTable as any).default || autoTable;
      autoTableFunc(doc, {
        startY: 38,
        margin: { left: 12, right: 12, bottom: 12 },
        tableWidth: 273,
        head: [['#', 'Photo', 'Student Name', 'College Name', 'Event / Room', 'Check-In Status']],
        body: tableRows.map((r, i) => [r[0], '', r[2], r[3], items[i]?.event_room || '', r[4]]),
        theme: 'grid',
        headStyles: {
          fillColor: [20, 45, 78], // #142D4E
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'center',
          valign: 'middle',
          minCellHeight: 9, // the header row does not need photo height
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
          2: { cellWidth: 66, fontStyle: 'bold' },
          3: { cellWidth: 82 },
          4: { cellWidth: 48 },
          5: { cellWidth: 45, halign: 'center', fontStyle: 'bold' },
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
            `MIT Mysore Student Attendance Tracker | Event / Room: ${eventRoomLabel} | Page ${pageNum}`,
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
        metadata: { format: 'pdf', category, source, count: items.length, event_room: eventRoomLabel },
      });

      const filename = `MITM_Students_${source === 'registered' ? 'Registered_Directory' : 'Attendance'}${fileTag}_${new Date().toISOString().slice(0, 10)}.pdf`;
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
          'Student Name': sanitizeCell(p.name),
          'College Name': sanitizeCell((p.college || p.metadata?.College || p.metadata?.Institution || '')),
          'Event / Room': sanitizeCell(r.event_room),
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
        `MIT MYSORE STUDENT ATTENDANCE TRACKER - ATTENDANCE PHOTOGRAPHS ARCHIVE
Generated: ${new Date().toISOString()}
Event / Room: ${eventRoomLabel}
Total Records: ${items.length}

Structure:
- manifest.csv: Maps student names, colleges and timestamps to photo filenames.
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

      const filename = `MITM_Students_Attendance_Photos${fileTag}_${new Date().toISOString().slice(0, 10)}.zip`;
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
