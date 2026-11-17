import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDevStorage, removeDevAttendanceRecord } from '@/lib/db/devStore';
import { recordAuditLog } from '@/lib/utils/audit';
import { requireAdmin } from '@/lib/auth/requireAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  noStore();
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    if (isPlaceholder) {
      const devStore = getDevStorage();
      let records = [...devStore.attendanceRecords];

      if (category && (category === 'guide' || category === 'phd_scholar' || category === 'student')) {
        records = records.filter((r) => r.attendee.category === category);
      }

      if (search.trim()) {
        const term = search.trim().toLowerCase();
        records = records.filter(
          (r) =>
            r.attendee.name.toLowerCase().includes(term) ||
            r.attendee.identifier.toLowerCase().includes(term)
        );
      }

      const total = records.length;
      const paginated = records.slice(offset, offset + limit);

      return NextResponse.json(
        {
          success: true,
          records: paginated,
          pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit) || 1,
          },
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    }

    const admin = createAdminClient();

    let query = admin
      .from('attendance_records')
      .select(
        `
        id,
        operation_id,
        captured_at_device,
        received_at_server,
        status,
        session_id,
        person_id,
        people!inner (
          id,
          name,
          category,
          normalized_email,
          phd_id,
          college,
          metadata
        ),
        event_sessions (
          name
        ),
        attendance_photos (
          storage_object_key,
          content_type,
          file_size
        )
      `,
        { count: 'exact' }
      );

    if (category && (category === 'guide' || category === 'phd_scholar' || category === 'student')) {
      query = query.eq('people.category', category);
    }

    if (search.trim()) {
      // Strip characters that have meaning inside a PostgREST or() filter
      const term = search.trim().replace(/[,()%*\\]/g, ' ');
      query = query.or(
        `name.ilike.%${term}%,college.ilike.%${term}%,normalized_email.ilike.%${term}%,phd_id.ilike.%${term}%`,
        { foreignTable: 'people' }
      );
    }

    query = query
      .order('captured_at_device', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: records, count, error } = await query;

    if (error) {
      console.error('Attendance fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Generate reliable app-proxied URLs for photographs so they never expire with JWT errors
    const recordsWithSignedPhotos = (records || []).map((rec: any) => {
      let photoSignedUrl = null;
      const photo = Array.isArray(rec.attendance_photos)
        ? rec.attendance_photos[0]
        : rec.attendance_photos;

      if (photo && photo.storage_object_key) {
        photoSignedUrl = `/api/attendance/photo?key=${encodeURIComponent(photo.storage_object_key)}`;
      }

      // Extract best email if available
      let email = rec.people.normalized_email;
      if (!email && rec.people.metadata) {
        email = rec.people.metadata.Email || rec.people.metadata.email || rec.people.metadata['Email ID'] || null;
      }
      if (!email && rec.people.phd_id && rec.people.phd_id.includes('@')) {
        email = rec.people.phd_id.toLowerCase();
      }

      return {
        id: rec.id,
        operation_id: rec.operation_id,
        captured_at_device: rec.captured_at_device,
        received_at_server: rec.received_at_server,
        status: rec.status,
        session_name: rec.event_sessions?.name || 'Main Session',
        attendee: {
          id: rec.people.id,
          name: rec.people.name,
          category: rec.people.category,
          email: email || null,
          phd_id: rec.people.phd_id || null,
          college: rec.people.college || rec.people.metadata?.College || null,
          identifier:
            rec.people.category === 'student'
              ? (rec.people.college || rec.people.metadata?.College || '—')
              : rec.people.category === 'guide'
              ? (email || rec.people.normalized_email || '—')
              : (rec.people.phd_id || '—'),
          extra_details: rec.people.metadata || {},
        },
        photo: {
          available: !!photoSignedUrl,
          signed_url: photoSignedUrl,
          file_size: photo?.file_size || 0,
          content_type: photo?.content_type || 'image/jpeg',
        },
      };
    });

    return NextResponse.json(
      {
        success: true,
        records: recordsWithSignedPhotos,
        pagination: {
          page,
          limit,
          total: count || 0,
          total_pages: Math.ceil((count || 0) / limit) || 1,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'CDN-Cache-Control': 'no-store',
          'Vercel-CDN-Cache-Control': 'no-store',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (err: any) {
    console.error('Attendance GET exception:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/attendance
 * Removes ONLY the attendance check-in record and photo for an attendee.
 * The registered person in the `people` table remains 100% intact and untouched.
 * Resets the attendee's status back to Not Attended (Pending).
 */
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  noStore();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id'); // Attendance Record ID
    const personId = searchParams.get('person_id'); // Registered Person ID

    if (!id && !personId) {
      return NextResponse.json(
        { error: 'Either attendance record "id" or "person_id" is required to delete attendance.' },
        { status: 400 }
      );
    }

    const isPlaceholder =
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    if (isPlaceholder) {
      const target = (id || personId)!;
      const removed = removeDevAttendanceRecord(target);
      return NextResponse.json({
        success: true,
        message: removed
          ? 'Attendance record removed. Attendee status reset to Not Attended.'
          : 'No active attendance record found.',
      });
    }

    const admin = createAdminClient();

    // 1. Find the target attendance record(s)
    let query = admin
      .from('attendance_records')
      .select(`
        id,
        person_id,
        operation_id,
        people (
          id,
          name,
          category,
          normalized_email,
          phd_id
        ),
        attendance_photos (
          id,
          storage_object_key
        )
      `);

    if (id) {
      query = query.eq('id', id);
    } else if (personId) {
      query = query.eq('person_id', personId);
    }

    const { data: records, error: findErr } = await query;

    if (findErr) {
      console.error('Find attendance record error:', findErr);
      return NextResponse.json({ error: findErr.message }, { status: 500 });
    }

    if (!records || records.length === 0) {
      return NextResponse.json(
        { error: 'Attendance record not found or already removed.' },
        { status: 404 }
      );
    }

    // Process removal for all matched records (usually 1)
    const removedDetails: any[] = [];

    for (const record of records) {
      const recordId = record.id;
      const attendeeName = (record.people as any)?.name || 'Attendee';
      const personDbId = record.person_id;

      // 2. Remove captured photograph from Supabase Storage bucket
      const photos = Array.isArray(record.attendance_photos)
        ? record.attendance_photos
        : record.attendance_photos
        ? [record.attendance_photos]
        : [];

      for (const p of photos) {
        if (p?.storage_object_key) {
          try {
            await admin.storage.from('mrf-attendance-photos').remove([p.storage_object_key]);
          } catch (storageErr) {
            console.warn('Storage photo deletion warning:', storageErr);
          }
        }
      }

      // 3. Delete attendance_photos table entry
      await admin.from('attendance_photos').delete().eq('attendance_record_id', recordId);

      // 4. Delete attendance_records table row (NOTE: `people` table is NOT touched)
      const { error: delErr } = await admin
        .from('attendance_records')
        .delete()
        .eq('id', recordId);

      if (delErr) {
        console.error('Attendance record deletion error:', delErr);
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      // 5. Clean up any related sync_conflicts for this operation
      if (record.operation_id) {
        await admin.from('sync_conflicts').delete().eq('operation_id', record.operation_id);
      }

      // 6. Record official audit log for compliance
      await recordAuditLog({
        action: 'ATTENDANCE_REVOKED',
        entityType: 'ATTENDANCE',
        entityId: recordId,
        outcome: 'success',
        metadata: {
          attendanceRecordId: recordId,
          personId: personDbId,
          personName: attendeeName,
          category: (record.people as any)?.category,
          operationId: record.operation_id,
          reason: 'Manual removal by administrator',
        },
      });

      removedDetails.push({
        attendanceRecordId: recordId,
        personId: personDbId,
        personName: attendeeName,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Attendance removed successfully for ${removedDetails.map((r) => r.personName).join(', ')}. Person details preserved and status reset to Not Attended.`,
      removed: removedDetails,
    });
  } catch (err: any) {
    console.error('Attendance DELETE exception:', err);
    return NextResponse.json({ error: err.message || 'Failed to remove attendance' }, { status: 500 });
  }
}
