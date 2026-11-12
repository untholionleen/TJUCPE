CREATE OR REPLACE FUNCTION public.tjucpe_finalize_class_delete(
  p_class_id uuid,
  p_backup_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_receipt public.class_backup_receipts%rowtype;
  v_paths text[];
  v_assignment_ids uuid[];
  v_report_ids uuid[];
  v_report_count integer := 0;
  v_record_count integer := 0;
  v_reference_count integer := 0;
BEGIN
  SELECT * INTO v_receipt
  FROM public.class_backup_receipts
  WHERE id = p_backup_id AND class_id = p_class_id AND actor_id = p_actor_id
    AND downloaded_at IS NOT NULL AND used_at IS NULL AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '有效的已下载班级备份凭证不存在或已过期，班级未删除';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_class_id) THEN
    RAISE EXCEPTION '班级不存在';
  END IF;

  SELECT coalesce(array_agg(a.id), array[]::uuid[]) INTO v_assignment_ids
  FROM public.experiment_assignments a WHERE a.class_id = p_class_id;
  SELECT coalesce(array_agg(r.id), array[]::uuid[]) INTO v_report_ids
  FROM public.report_submissions r WHERE r.class_id = p_class_id;
  SELECT count(*) INTO v_report_count FROM public.report_submissions r WHERE r.class_id = p_class_id;
  IF cardinality(v_assignment_ids) > 0 THEN
    SELECT count(*) INTO v_record_count FROM public.experiment_records er
    WHERE er.assignment_id = ANY(v_assignment_ids);
  END IF;
  SELECT count(*) INTO v_reference_count FROM public.experiment_reference_sets rs
  WHERE rs.class_id = p_class_id;

  SELECT coalesce(array_agg(DISTINCT p), array[]::text[]) INTO v_paths
  FROM (
    SELECT r.storage_path AS p FROM public.report_submissions r
      WHERE r.class_id = p_class_id AND r.storage_path IS NOT NULL
    UNION ALL
    SELECT r.data_file_path AS p FROM public.report_submissions r
      WHERE r.class_id = p_class_id AND r.data_file_path IS NOT NULL
    UNION ALL
    SELECT r.annotation_source_path AS p FROM public.report_submissions r
      WHERE r.class_id = p_class_id AND r.annotation_source_path IS NOT NULL
    UNION ALL
    SELECT rr.previous_storage_path AS p FROM public.report_revisions rr
      WHERE rr.report_id = ANY(v_report_ids) AND rr.previous_storage_path IS NOT NULL
    UNION ALL
    SELECT rr.previous_data_file_path AS p FROM public.report_revisions rr
      WHERE rr.report_id = ANY(v_report_ids) AND rr.previous_data_file_path IS NOT NULL
    UNION ALL
    SELECT rs.storage_path AS p FROM public.experiment_reference_sets rs
      WHERE rs.class_id = p_class_id AND rs.storage_path IS NOT NULL
  ) files;

  UPDATE public.class_backup_receipts SET used_at = now() WHERE id = p_backup_id;
  IF cardinality(v_assignment_ids) > 0 THEN
    DELETE FROM public.experiment_records er WHERE er.assignment_id = ANY(v_assignment_ids);
  END IF;
  DELETE FROM public.experiment_reference_sets WHERE class_id = p_class_id;
  IF cardinality(v_report_ids) > 0 THEN
    DELETE FROM public.report_revisions rr WHERE rr.report_id = ANY(v_report_ids);
  END IF;
  DELETE FROM public.report_submissions WHERE class_id = p_class_id;
  DELETE FROM public.experiment_assignments WHERE class_id = p_class_id;
  DELETE FROM public.class_members WHERE class_id = p_class_id;

  INSERT INTO public.audit_logs(actor_id, action, details)
  VALUES (
    p_actor_id, 'class.permanently_deleted_after_backup',
    jsonb_build_object(
      'class_id', p_class_id, 'backup_id', p_backup_id,
      'backup_file_name', v_receipt.backup_file_name,
      'report_count', v_report_count, 'analysis_record_count', v_record_count,
      'reference_set_count', v_reference_count, 'file_count', cardinality(v_paths)
    )
  );
  DELETE FROM public.classes WHERE id = p_class_id;

  RETURN jsonb_build_object(
    'ok', true, 'class_id', p_class_id, 'report_count', v_report_count,
    'analysis_record_count', v_record_count, 'reference_set_count', v_reference_count,
    'storage_paths', to_jsonb(v_paths)
  );
END;
$function$;
