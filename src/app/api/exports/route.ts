import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
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
    const format = searchParams.get('format') || 'csv'; // 'csv', 'xlsx', 'zip'
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
        phd_id
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
        'Event Name': sanitizeCell(r.event_sessions?.events?.name || 'MRF Conclave'),
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
