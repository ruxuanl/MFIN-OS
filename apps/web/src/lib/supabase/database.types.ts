export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_dependencies: {
        Row: {
          action_id: string
          created_at: string
          depends_on_action_id: string
          user_id: string
        }
        Insert: {
          action_id: string
          created_at?: string
          depends_on_action_id: string
          user_id: string
        }
        Update: {
          action_id?: string
          created_at?: string
          depends_on_action_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_dependencies_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_dependencies_depends_on_action_id_fkey"
            columns: ["depends_on_action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
        ]
      }
      actions: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          completion_criteria: string | null
          context_id: string | null
          context_type: string
          created_at: string
          due_at: string | null
          estimated_minutes: number | null
          id: string
          priority: string
          status: string
          suggested_start_at: string | null
          title: string
          track: string | null
          updated_at: string
          user_id: string
          version: number
          waiting_on: string | null
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          completion_criteria?: string | null
          context_id?: string | null
          context_type: string
          created_at?: string
          due_at?: string | null
          estimated_minutes?: number | null
          id?: string
          priority?: string
          status?: string
          suggested_start_at?: string | null
          title: string
          track?: string | null
          updated_at?: string
          user_id: string
          version?: number
          waiting_on?: string | null
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          completion_criteria?: string | null
          context_id?: string | null
          context_type?: string
          created_at?: string
          due_at?: string | null
          estimated_minutes?: number | null
          id?: string
          priority?: string
          status?: string
          suggested_start_at?: string | null
          title?: string
          track?: string | null
          updated_at?: string
          user_id?: string
          version?: number
          waiting_on?: string | null
        }
        Relationships: []
      }
      ai_analyses: {
        Row: {
          analysis_kind: string
          created_at: string
          id: string
          input_fingerprint: string
          model: string
          opportunity_id: string | null
          prompt_version: string
          provider: string
          result: Json
          resume_version_id: string
          usage_event_id: string
          user_id: string
        }
        Insert: {
          analysis_kind: string
          created_at?: string
          id?: string
          input_fingerprint: string
          model: string
          opportunity_id?: string | null
          prompt_version: string
          provider?: string
          result: Json
          resume_version_id: string
          usage_event_id: string
          user_id: string
        }
        Update: {
          analysis_kind?: string
          created_at?: string
          id?: string
          input_fingerprint?: string
          model?: string
          opportunity_id?: string | null
          prompt_version?: string
          provider?: string
          result?: Json
          resume_version_id?: string
          usage_event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_analyses_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_analyses_resume_version_id_fkey"
            columns: ["resume_version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_analyses_usage_event_id_fkey"
            columns: ["usage_event_id"]
            isOneToOne: true
            referencedRelation: "ai_usage_events"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          actual_hkd_cents: number | null
          analysis_kind: string
          created_at: string
          error_code: string | null
          finished_at: string | null
          id: string
          input_fingerprint: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          provider: string
          reserved_hkd_cents: number
          status: string
          user_id: string
        }
        Insert: {
          actual_hkd_cents?: number | null
          analysis_kind: string
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          input_fingerprint: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          provider?: string
          reserved_hkd_cents: number
          status?: string
          user_id: string
        }
        Update: {
          actual_hkd_cents?: number | null
          analysis_kind?: string
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          input_fingerprint?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          provider?: string
          reserved_hkd_cents?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      application_package_items: {
        Row: {
          created_at: string
          done: boolean
          done_at: string | null
          evidence: string | null
          id: string
          item_key: string
          label: string
          package_id: string
          position: number
          required: boolean
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          evidence?: string | null
          id?: string
          item_key: string
          label: string
          package_id: string
          position: number
          required?: boolean
          source: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          evidence?: string | null
          id?: string
          item_key?: string
          label?: string
          package_id?: string
          position?: number
          required?: boolean
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      application_packages: {
        Row: {
          created_at: string
          deadline_action_id: string | null
          id: string
          official_apply_url: string | null
          opportunity_id: string
          recommendation_reason: string | null
          recommended_resume_version_id: string | null
          rule_version: string
          selected_at: string | null
          selected_resume_version_id: string | null
          status: string
          suggested_start_on: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          deadline_action_id?: string | null
          id?: string
          official_apply_url?: string | null
          opportunity_id: string
          recommendation_reason?: string | null
          recommended_resume_version_id?: string | null
          rule_version: string
          selected_at?: string | null
          selected_resume_version_id?: string | null
          status?: string
          suggested_start_on?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          deadline_action_id?: string | null
          id?: string
          official_apply_url?: string | null
          opportunity_id?: string
          recommendation_reason?: string | null
          recommended_resume_version_id?: string | null
          rule_version?: string
          selected_at?: string | null
          selected_resume_version_id?: string | null
          status?: string
          suggested_start_on?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      application_snapshots: {
        Row: {
          answers_text: string | null
          application_reference: string | null
          checklist: Json
          company: string
          created_at: string
          id: string
          jd_text: string | null
          opportunity_id: string
          opportunity_version_after: number
          package_id: string | null
          previous_state: Json
          resume_label: string | null
          resume_version_id: string | null
          role_title: string
          source_url: string | null
          status: string
          submitted_at: string
          track: string
          undone_at: string | null
          user_id: string
        }
        Insert: {
          answers_text?: string | null
          application_reference?: string | null
          checklist?: Json
          company: string
          created_at?: string
          id?: string
          jd_text?: string | null
          opportunity_id: string
          opportunity_version_after: number
          package_id?: string | null
          previous_state: Json
          resume_label?: string | null
          resume_version_id?: string | null
          role_title: string
          source_url?: string | null
          status?: string
          submitted_at: string
          track: string
          undone_at?: string | null
          user_id: string
        }
        Update: {
          answers_text?: string | null
          application_reference?: string | null
          checklist?: Json
          company?: string
          created_at?: string
          id?: string
          jd_text?: string | null
          opportunity_id?: string
          opportunity_version_after?: number
          package_id?: string | null
          previous_state?: Json
          resume_label?: string | null
          resume_version_id?: string | null
          role_title?: string
          source_url?: string | null
          status?: string
          submitted_at?: string
          track?: string
          undone_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      audit_event_evidence: {
        Row: {
          audit_event_id: string
          created_at: string
          evidence_id: string
        }
        Insert: {
          audit_event_id: string
          created_at?: string
          evidence_id: string
        }
        Update: {
          audit_event_id?: string
          created_at?: string
          evidence_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_event_evidence_audit_event_id_fkey"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "audit_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_event_evidence_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_refs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_type: string
          after_state: Json | null
          before_state: Json | null
          confidence: number | null
          created_at: string
          error_code: string | null
          id: string
          object_id: string | null
          object_type: string
          operation_id: string | null
          outcome: string
          permission_decision: Json | null
          reversible: boolean
          rule_version: string | null
          trace_id: string
          undo_deadline: string | null
          user_id: string
        }
        Insert: {
          action: string
          actor_type: string
          after_state?: Json | null
          before_state?: Json | null
          confidence?: number | null
          created_at?: string
          error_code?: string | null
          id?: string
          object_id?: string | null
          object_type: string
          operation_id?: string | null
          outcome: string
          permission_decision?: Json | null
          reversible?: boolean
          rule_version?: string | null
          trace_id?: string
          undo_deadline?: string | null
          user_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          after_state?: Json | null
          before_state?: Json | null
          confidence?: number | null
          created_at?: string
          error_code?: string | null
          id?: string
          object_id?: string | null
          object_type?: string
          operation_id?: string | null
          outcome?: string
          permission_decision?: Json | null
          reversible?: boolean
          rule_version?: string | null
          trace_id?: string
          undo_deadline?: string | null
          user_id?: string
        }
        Relationships: []
      }
      automation_attempts: {
        Row: {
          attempt_number: number
          automation_run_id: string
          error_code: string | null
          error_summary: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          attempt_number: number
          automation_run_id: string
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status: string
          user_id: string
        }
        Update: {
          attempt_number?: number
          automation_run_id?: string
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_attempts_automation_run_id_fkey"
            columns: ["automation_run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          attempt_count: number
          cancel_requested_at: string | null
          capability_key: string
          created_at: string
          finished_at: string | null
          id: string
          idempotency_key: string
          input_reference: Json
          last_error_code: string | null
          last_error_summary: string | null
          max_attempts: number
          next_attempt_at: string | null
          operation_id: string
          permission_grant_id: string | null
          permission_snapshot: Json
          progress: number
          result_reference: Json | null
          safe_checkpoint: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          cancel_requested_at?: string | null
          capability_key: string
          created_at?: string
          finished_at?: string | null
          id?: string
          idempotency_key: string
          input_reference?: Json
          last_error_code?: string | null
          last_error_summary?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          operation_id?: string
          permission_grant_id?: string | null
          permission_snapshot?: Json
          progress?: number
          result_reference?: Json | null
          safe_checkpoint?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          cancel_requested_at?: string | null
          capability_key?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          input_reference?: Json
          last_error_code?: string | null
          last_error_summary?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          operation_id?: string
          permission_grant_id?: string | null
          permission_snapshot?: Json
          progress?: number
          result_reference?: Json | null
          safe_checkpoint?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capability_definitions"
            referencedColumns: ["capability_key"]
          },
          {
            foreignKeyName: "automation_runs_permission_grant_id_fkey"
            columns: ["permission_grant_id"]
            isOneToOne: false
            referencedRelation: "permission_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_links: {
        Row: {
          action_id: string
          all_day: boolean
          calendar_event_id: string | null
          calendar_source_id: string | null
          category: string
          created_at: string
          id: string
          last_error_code: string | null
          last_synced_action_version: number | null
          last_synced_provider_updated_at: string | null
          provider_etag: string | null
          provider_event_id: string | null
          scheduled_end_at: string | null
          scheduled_end_date: string | null
          scheduled_start_at: string | null
          scheduled_start_date: string | null
          sync_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_id: string
          all_day: boolean
          calendar_event_id?: string | null
          calendar_source_id?: string | null
          category: string
          created_at?: string
          id?: string
          last_error_code?: string | null
          last_synced_action_version?: number | null
          last_synced_provider_updated_at?: string | null
          provider_etag?: string | null
          provider_event_id?: string | null
          scheduled_end_at?: string | null
          scheduled_end_date?: string | null
          scheduled_start_at?: string | null
          scheduled_start_date?: string | null
          sync_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_id?: string
          all_day?: boolean
          calendar_event_id?: string | null
          calendar_source_id?: string | null
          category?: string
          created_at?: string
          id?: string
          last_error_code?: string | null
          last_synced_action_version?: number | null
          last_synced_provider_updated_at?: string | null
          provider_etag?: string | null
          provider_event_id?: string | null
          scheduled_end_at?: string | null
          scheduled_end_date?: string | null
          scheduled_start_at?: string | null
          scheduled_start_date?: string | null
          sync_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_links_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_links_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_links_calendar_source_id_fkey"
            columns: ["calendar_source_id"]
            isOneToOne: false
            referencedRelation: "calendar_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          calendar_source_id: string
          created_at: string
          creator_self: boolean
          deleted: boolean
          description: string | null
          ends_at: string | null
          ends_on: string | null
          etag: string | null
          event_label_id: string | null
          event_type: string
          first_seen_at: string
          html_link: string | null
          id: string
          last_seen_at: string
          location: string | null
          organizer_self: boolean
          product_action_id: string | null
          product_owned: boolean
          provider_created_at: string | null
          provider_event_id: string
          provider_updated_at: string | null
          recurring_event_id: string | null
          starts_at: string | null
          starts_on: string | null
          status: string
          summary: string | null
          transparency: string | null
          updated_at: string
          user_id: string
          visibility: string | null
        }
        Insert: {
          all_day: boolean
          calendar_source_id: string
          created_at?: string
          creator_self?: boolean
          deleted?: boolean
          description?: string | null
          ends_at?: string | null
          ends_on?: string | null
          etag?: string | null
          event_label_id?: string | null
          event_type?: string
          first_seen_at?: string
          html_link?: string | null
          id?: string
          last_seen_at?: string
          location?: string | null
          organizer_self?: boolean
          product_action_id?: string | null
          product_owned?: boolean
          provider_created_at?: string | null
          provider_event_id: string
          provider_updated_at?: string | null
          recurring_event_id?: string | null
          starts_at?: string | null
          starts_on?: string | null
          status: string
          summary?: string | null
          transparency?: string | null
          updated_at?: string
          user_id: string
          visibility?: string | null
        }
        Update: {
          all_day?: boolean
          calendar_source_id?: string
          created_at?: string
          creator_self?: boolean
          deleted?: boolean
          description?: string | null
          ends_at?: string | null
          ends_on?: string | null
          etag?: string | null
          event_label_id?: string | null
          event_type?: string
          first_seen_at?: string
          html_link?: string | null
          id?: string
          last_seen_at?: string
          location?: string | null
          organizer_self?: boolean
          product_action_id?: string | null
          product_owned?: boolean
          provider_created_at?: string | null
          provider_event_id?: string
          provider_updated_at?: string | null
          recurring_event_id?: string | null
          starts_at?: string | null
          starts_on?: string | null
          status?: string
          summary?: string | null
          transparency?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_calendar_source_id_fkey"
            columns: ["calendar_source_id"]
            isOneToOne: false
            referencedRelation: "calendar_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_product_action_id_fkey"
            columns: ["product_action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sources: {
        Row: {
          access_role: string
          connection_id: string
          created_at: string
          id: string
          is_primary: boolean
          is_product_calendar: boolean
          last_error_code: string | null
          last_full_sync_at: string | null
          last_incremental_sync_at: string | null
          provider_calendar_id: string
          selected_for_conflicts: boolean
          summary: string
          sync_state: string
          time_zone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_role: string
          connection_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          is_product_calendar?: boolean
          last_error_code?: string | null
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          provider_calendar_id: string
          selected_for_conflicts?: boolean
          summary: string
          sync_state?: string
          time_zone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_role?: string
          connection_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          is_product_calendar?: boolean
          last_error_code?: string | null
          last_full_sync_at?: string | null
          last_incremental_sync_at?: string | null
          provider_calendar_id?: string
          selected_for_conflicts?: boolean
          summary?: string
          sync_state?: string
          time_zone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sources_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "external_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_conflicts: {
        Row: {
          conflict_type: string
          created_at: string
          event_link_id: string
          id: string
          product_snapshot: Json
          provider_snapshot: Json
          resolution: string | null
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          conflict_type: string
          created_at?: string
          event_link_id: string
          id?: string
          product_snapshot?: Json
          provider_snapshot?: Json
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          conflict_type?: string
          created_at?: string
          event_link_id?: string
          id?: string
          product_snapshot?: Json
          provider_snapshot?: Json
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_conflicts_event_link_id_fkey"
            columns: ["event_link_id"]
            isOneToOne: false
            referencedRelation: "calendar_event_links"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_operations: {
        Row: {
          attempt_count: number
          blocked_reason: string | null
          capability_key: string
          created_at: string
          event_link_id: string
          finished_at: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          max_attempts: number
          next_attempt_at: string | null
          operation_type: string
          started_at: string | null
          status: string
          target_action_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          blocked_reason?: string | null
          capability_key: string
          created_at?: string
          event_link_id: string
          finished_at?: string | null
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          operation_type: string
          started_at?: string | null
          status?: string
          target_action_version: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          blocked_reason?: string | null
          capability_key?: string
          created_at?: string
          event_link_id?: string
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          operation_type?: string
          started_at?: string | null
          status?: string
          target_action_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_operations_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capability_definitions"
            referencedColumns: ["capability_key"]
          },
          {
            foreignKeyName: "calendar_sync_operations_event_link_id_fkey"
            columns: ["event_link_id"]
            isOneToOne: false
            referencedRelation: "calendar_event_links"
            referencedColumns: ["id"]
          },
        ]
      }
      capability_definitions: {
        Row: {
          capability_key: string
          category: string
          connection_provider: string | null
          created_at: string
          description: string
          label: string
          requires_ai: boolean
          requires_reverification: boolean
          risk_level: string
          supports_once: boolean
          supports_timed: boolean
          updated_at: string
        }
        Insert: {
          capability_key: string
          category: string
          connection_provider?: string | null
          created_at?: string
          description: string
          label: string
          requires_ai?: boolean
          requires_reverification?: boolean
          risk_level: string
          supports_once?: boolean
          supports_timed?: boolean
          updated_at?: string
        }
        Update: {
          capability_key?: string
          category?: string
          connection_provider?: string | null
          created_at?: string
          description?: string
          label?: string
          requires_ai?: boolean
          requires_reverification?: boolean
          risk_level?: string
          supports_once?: boolean
          supports_timed?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      capability_dependencies: {
        Row: {
          capability_key: string
          created_at: string
          required_capability_key: string
        }
        Insert: {
          capability_key: string
          created_at?: string
          required_capability_key: string
        }
        Update: {
          capability_key?: string
          created_at?: string
          required_capability_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "capability_dependencies_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capability_definitions"
            referencedColumns: ["capability_key"]
          },
          {
            foreignKeyName: "capability_dependencies_required_capability_key_fkey"
            columns: ["required_capability_key"]
            isOneToOne: false
            referencedRelation: "capability_definitions"
            referencedColumns: ["capability_key"]
          },
        ]
      }
      client_mutations: {
        Row: {
          base_version: number
          created_at: string
          device_id: string
          id: string
          object_id: string
          object_type: string
          patch: Json
          result: Json
          status: string
          user_id: string
        }
        Insert: {
          base_version: number
          created_at?: string
          device_id: string
          id: string
          object_id: string
          object_type: string
          patch: Json
          result: Json
          status: string
          user_id: string
        }
        Update: {
          base_version?: number
          created_at?: string
          device_id?: string
          id?: string
          object_id?: string
          object_type?: string
          patch?: Json
          result?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          archived_at: string | null
          course_code: string
          course_status: string
          created_at: string
          ends_on: string | null
          fixed_schedule: string | null
          id: string
          module: number | null
          next_deadline: string | null
          record_state: string
          starts_on: string | null
          title: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          course_code: string
          course_status?: string
          created_at?: string
          ends_on?: string | null
          fixed_schedule?: string | null
          id?: string
          module?: number | null
          next_deadline?: string | null
          record_state?: string
          starts_on?: string | null
          title: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          course_code?: string
          course_status?: string
          created_at?: string
          ends_on?: string | null
          fixed_schedule?: string | null
          id?: string
          module?: number | null
          next_deadline?: string | null
          record_state?: string
          starts_on?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      custom_field_definitions: {
        Row: {
          active: boolean
          created_at: string
          field_key: string
          field_type: string
          id: string
          label: string
          options: Json
          position: number
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          field_key: string
          field_type: string
          id?: string
          label: string
          options?: Json
          position?: number
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          field_key?: string
          field_type?: string
          id?: string
          label?: string
          options?: Json
          position?: number
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_field_values: {
        Row: {
          created_at: string
          definition_id: string
          entity_id: string
          entity_type: string
          id: string
          updated_at: string
          user_id: string
          value: Json
          version: number
        }
        Insert: {
          created_at?: string
          definition_id: string
          entity_id: string
          entity_type: string
          id?: string
          updated_at?: string
          user_id: string
          value: Json
          version?: number
        }
        Update: {
          created_at?: string
          definition_id?: string
          entity_id?: string
          entity_type?: string
          id?: string
          updated_at?: string
          user_id?: string
          value?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_refs: {
        Row: {
          content_hash: string | null
          created_at: string
          discovered_at: string
          id: string
          last_verified_at: string | null
          source_locator: string | null
          source_type: string
          summary: string | null
          user_id: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          discovered_at?: string
          id?: string
          last_verified_at?: string | null
          source_locator?: string | null
          source_type: string
          summary?: string | null
          user_id: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          discovered_at?: string
          id?: string
          last_verified_at?: string | null
          source_locator?: string | null
          source_type?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: []
      }
      external_connections: {
        Row: {
          created_at: string
          granted_scopes: string[]
          id: string
          last_error_at: string | null
          last_error_code: string | null
          last_success_at: string | null
          provider: string
          secret_reference_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_scopes?: string[]
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          provider: string
          secret_reference_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_scopes?: string[]
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          provider?: string
          secret_reference_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      field_locks: {
        Row: {
          created_at: string
          field_path: string
          id: string
          locked_at: string
          object_id: string
          object_type: string
          reason: string | null
          unlocked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          field_path: string
          id?: string
          locked_at?: string
          object_id: string
          object_type: string
          reason?: string | null
          unlocked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          field_path?: string
          id?: string
          locked_at?: string
          object_id?: string
          object_type?: string
          reason?: string | null
          unlocked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gmail_attachments: {
        Row: {
          content_sha256: string | null
          created_at: string
          deleted_at: string | null
          failure_code: string | null
          filename: string
          gmail_message_id: string
          id: string
          import_status: string
          imported_at: string | null
          mime_type: string
          provider_attachment_id: string
          size_bytes: number
          storage_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content_sha256?: string | null
          created_at?: string
          deleted_at?: string | null
          failure_code?: string | null
          filename: string
          gmail_message_id: string
          id?: string
          import_status?: string
          imported_at?: string | null
          mime_type: string
          provider_attachment_id: string
          size_bytes: number
          storage_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content_sha256?: string | null
          created_at?: string
          deleted_at?: string | null
          failure_code?: string | null
          filename?: string
          gmail_message_id?: string
          id?: string
          import_status?: string
          imported_at?: string | null
          mime_type?: string
          provider_attachment_id?: string
          size_bytes?: number
          storage_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_attachments_gmail_message_id_fkey"
            columns: ["gmail_message_id"]
            isOneToOne: false
            referencedRelation: "gmail_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_messages: {
        Row: {
          action_due_at: string | null
          action_title: string | null
          classification: string
          confidence: number
          created_at: string
          evidence_id: string | null
          gmail_link: string
          history_id: string
          id: string
          needs_action: boolean
          processing_status: string
          provider_message_id: string
          provider_thread_id: string
          received_at: string
          rule_version: string
          sender_summary: string | null
          source_identity: string
          subject: string
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_due_at?: string | null
          action_title?: string | null
          classification: string
          confidence: number
          created_at?: string
          evidence_id?: string | null
          gmail_link: string
          history_id: string
          id?: string
          needs_action?: boolean
          processing_status?: string
          provider_message_id: string
          provider_thread_id: string
          received_at: string
          rule_version?: string
          sender_summary?: string | null
          source_identity?: string
          subject?: string
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_due_at?: string | null
          action_title?: string | null
          classification?: string
          confidence?: number
          created_at?: string
          evidence_id?: string | null
          gmail_link?: string
          history_id?: string
          id?: string
          needs_action?: boolean
          processing_status?: string
          provider_message_id?: string
          provider_thread_id?: string
          received_at?: string
          rule_version?: string
          sender_summary?: string | null
          source_identity?: string
          subject?: string
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_messages_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_refs"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_updates: {
        Row: {
          action_id: string | null
          applied_at: string
          audit_event_id: string
          calendar_operation_id: string | null
          id: string
          inbox_item_id: string
          opportunity_id: string
          previous_main_stage: string
          previous_substage: string | null
          status: string
          undo_operation_id: string | null
          undone_at: string | null
          update_type: string
          user_id: string
        }
        Insert: {
          action_id?: string | null
          applied_at?: string
          audit_event_id: string
          calendar_operation_id?: string | null
          id?: string
          inbox_item_id: string
          opportunity_id: string
          previous_main_stage: string
          previous_substage?: string | null
          status?: string
          undo_operation_id?: string | null
          undone_at?: string | null
          update_type: string
          user_id: string
        }
        Update: {
          action_id?: string | null
          applied_at?: string
          audit_event_id?: string
          calendar_operation_id?: string | null
          id?: string
          inbox_item_id?: string
          opportunity_id?: string
          previous_main_stage?: string
          previous_substage?: string | null
          status?: string
          undo_operation_id?: string | null
          undone_at?: string | null
          update_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_updates_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_updates_audit_event_id_fkey"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "audit_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_updates_calendar_operation_id_fkey"
            columns: ["calendar_operation_id"]
            isOneToOne: false
            referencedRelation: "calendar_sync_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_updates_inbox_item_id_fkey"
            columns: ["inbox_item_id"]
            isOneToOne: true
            referencedRelation: "inbox_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_updates_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_updates_undo_operation_id_fkey"
            columns: ["undo_operation_id"]
            isOneToOne: false
            referencedRelation: "undo_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_items: {
        Row: {
          action_id: string | null
          classification: string
          confidence: number
          created_at: string
          evidence_id: string | null
          gmail_message_id: string | null
          id: string
          item_type: string
          resolved_at: string | null
          status: string
          summary: string
          target_id: string | null
          target_type: string | null
          title: string
          updated_at: string
          user_id: string
          wechat_projection_id: string | null
        }
        Insert: {
          action_id?: string | null
          classification: string
          confidence: number
          created_at?: string
          evidence_id?: string | null
          gmail_message_id?: string | null
          id?: string
          item_type: string
          resolved_at?: string | null
          status?: string
          summary: string
          target_id?: string | null
          target_type?: string | null
          title: string
          updated_at?: string
          user_id: string
          wechat_projection_id?: string | null
        }
        Update: {
          action_id?: string | null
          classification?: string
          confidence?: number
          created_at?: string
          evidence_id?: string | null
          gmail_message_id?: string | null
          id?: string
          item_type?: string
          resolved_at?: string | null
          status?: string
          summary?: string
          target_id?: string | null
          target_type?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          wechat_projection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbox_items_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_items_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_items_gmail_message_id_fkey"
            columns: ["gmail_message_id"]
            isOneToOne: false
            referencedRelation: "gmail_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_wechat_projection_fk"
            columns: ["wechat_projection_id"]
            isOneToOne: false
            referencedRelation: "wechat_projections"
            referencedColumns: ["id"]
          },
        ]
      }
      job_source_runs: {
        Row: {
          automation_run_id: string
          coverage_gap: string | null
          created_at: string
          error_code: string | null
          finished_at: string | null
          id: string
          new_count: number
          observed_count: number
          run_key: string
          source_id: string
          started_at: string
          status: string
          updated_count: number
          user_id: string
        }
        Insert: {
          automation_run_id: string
          coverage_gap?: string | null
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          new_count?: number
          observed_count?: number
          run_key: string
          source_id: string
          started_at?: string
          status?: string
          updated_count?: number
          user_id: string
        }
        Update: {
          automation_run_id?: string
          coverage_gap?: string | null
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          new_count?: number
          observed_count?: number
          run_key?: string
          source_id?: string
          started_at?: string
          status?: string
          updated_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_source_runs_automation_run_id_fkey"
            columns: ["automation_run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_source_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "job_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sources: {
        Row: {
          access_mode: string
          adapter_version: string
          approval_status: string
          base_url: string
          coverage_gap: string | null
          coverage_scope: string
          created_at: string
          display_name: string
          enabled: boolean
          health_status: string
          id: string
          last_attempt_at: string | null
          last_error_code: string | null
          last_success_at: string | null
          last_verified_at: string | null
          polling_interval_minutes: number
          source_domain: string
          source_key: string
          source_kind: string
          updated_at: string
          usage_note: string | null
          user_id: string
        }
        Insert: {
          access_mode?: string
          adapter_version: string
          approval_status?: string
          base_url: string
          coverage_gap?: string | null
          coverage_scope: string
          created_at?: string
          display_name: string
          enabled?: boolean
          health_status?: string
          id?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          last_verified_at?: string | null
          polling_interval_minutes?: number
          source_domain: string
          source_key: string
          source_kind: string
          updated_at?: string
          usage_note?: string | null
          user_id: string
        }
        Update: {
          access_mode?: string
          adapter_version?: string
          approval_status?: string
          base_url?: string
          coverage_gap?: string | null
          coverage_scope?: string
          created_at?: string
          display_name?: string
          enabled?: boolean
          health_status?: string
          id?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          last_verified_at?: string | null
          polling_interval_minutes?: number
          source_domain?: string
          source_key?: string
          source_kind?: string
          updated_at?: string
          usage_note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          deliver_after: string
          delivered_at: string | null
          failure_code: string | null
          id: string
          notification_type: string
          read_at: string | null
          reason: string
          status: string
          target_path: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key: string
          deliver_after?: string
          delivered_at?: string | null
          failure_code?: string | null
          id?: string
          notification_type: string
          read_at?: string | null
          reason: string
          status?: string
          target_path?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          deliver_after?: string
          delivered_at?: string | null
          failure_code?: string | null
          id?: string
          notification_type?: string
          read_at?: string | null
          reason?: string
          status?: string
          target_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          application_method: string | null
          applied_at: string | null
          archived_at: string | null
          candidate_id: string | null
          close_reason: string | null
          company: string
          created_at: string
          deadline: string | null
          department: string | null
          extraction_confidence: number | null
          extraction_gaps: string[]
          id: string
          intent: string
          location: string | null
          main_stage: string
          parser_version: string | null
          posted_on: string | null
          raw_jd: string | null
          record_state: string
          requirements: string | null
          responsibilities: string | null
          role_title: string
          source_summary: string | null
          source_url: string | null
          substage: string | null
          track: string
          updated_at: string
          user_id: string
          version: number
          waiting_on: string | null
          work_mode: string | null
        }
        Insert: {
          application_method?: string | null
          applied_at?: string | null
          archived_at?: string | null
          candidate_id?: string | null
          close_reason?: string | null
          company: string
          created_at?: string
          deadline?: string | null
          department?: string | null
          extraction_confidence?: number | null
          extraction_gaps?: string[]
          id?: string
          intent?: string
          location?: string | null
          main_stage?: string
          parser_version?: string | null
          posted_on?: string | null
          raw_jd?: string | null
          record_state?: string
          requirements?: string | null
          responsibilities?: string | null
          role_title: string
          source_summary?: string | null
          source_url?: string | null
          substage?: string | null
          track: string
          updated_at?: string
          user_id: string
          version?: number
          waiting_on?: string | null
          work_mode?: string | null
        }
        Update: {
          application_method?: string | null
          applied_at?: string | null
          archived_at?: string | null
          candidate_id?: string | null
          close_reason?: string | null
          company?: string
          created_at?: string
          deadline?: string | null
          department?: string | null
          extraction_confidence?: number | null
          extraction_gaps?: string[]
          id?: string
          intent?: string
          location?: string | null
          main_stage?: string
          parser_version?: string | null
          posted_on?: string | null
          raw_jd?: string | null
          record_state?: string
          requirements?: string | null
          responsibilities?: string | null
          role_title?: string
          source_summary?: string | null
          source_url?: string | null
          substage?: string | null
          track?: string
          updated_at?: string
          user_id?: string
          version?: number
          waiting_on?: string | null
          work_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "opportunity_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_communications: {
        Row: {
          decided_at: string | null
          created_at: string
          gmail_message_id: string
          id: string
          match_evidence: string
          match_rule: string
          opportunity_id: string
          rule_version: string
          status: string
          suggested_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          decided_at?: string | null
          created_at?: string
          gmail_message_id: string
          id?: string
          match_evidence: string
          match_rule: string
          opportunity_id: string
          rule_version?: string
          status?: string
          suggested_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          decided_at?: string | null
          created_at?: string
          gmail_message_id?: string
          id?: string
          match_evidence?: string
          match_rule?: string
          opportunity_id?: string
          rule_version?: string
          status?: string
          suggested_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      opportunity_candidates: {
        Row: {
          company: string
          created_at: string
          deadline: string | null
          decision_reason: string | null
          decision_status: string
          department: string | null
          discovered_at: string
          id: string
          interest_score: number | null
          jd_fingerprint: string | null
          last_verified_at: string | null
          location: string | null
          match_score: number | null
          posted_on: string | null
          promoted_opportunity_id: string | null
          qualification_score: number | null
          role_title: string
          source_summary: string | null
          source_url: string | null
          track: string
          updated_at: string
          urgency_score: number | null
          user_id: string
          version: number
          work_mode: string | null
        }
        Insert: {
          company: string
          created_at?: string
          deadline?: string | null
          decision_reason?: string | null
          decision_status?: string
          department?: string | null
          discovered_at?: string
          id?: string
          interest_score?: number | null
          jd_fingerprint?: string | null
          last_verified_at?: string | null
          location?: string | null
          match_score?: number | null
          posted_on?: string | null
          promoted_opportunity_id?: string | null
          qualification_score?: number | null
          role_title: string
          source_summary?: string | null
          source_url?: string | null
          track: string
          updated_at?: string
          urgency_score?: number | null
          user_id: string
          version?: number
          work_mode?: string | null
        }
        Update: {
          company?: string
          created_at?: string
          deadline?: string | null
          decision_reason?: string | null
          decision_status?: string
          department?: string | null
          discovered_at?: string
          id?: string
          interest_score?: number | null
          jd_fingerprint?: string | null
          last_verified_at?: string | null
          location?: string | null
          match_score?: number | null
          posted_on?: string | null
          promoted_opportunity_id?: string | null
          qualification_score?: number | null
          role_title?: string
          source_summary?: string | null
          source_url?: string | null
          track?: string
          updated_at?: string
          urgency_score?: number | null
          user_id?: string
          version?: number
          work_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_candidates_promoted_fk"
            columns: ["promoted_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_resume_assignments: {
        Row: {
          assignment_kind: string
          id: string
          is_current: boolean
          opportunity_id: string
          resume_version_id: string
          selected_at: string
          superseded_at: string | null
          user_id: string
        }
        Insert: {
          assignment_kind: string
          id?: string
          is_current?: boolean
          opportunity_id: string
          resume_version_id: string
          selected_at?: string
          superseded_at?: string | null
          user_id: string
        }
        Update: {
          assignment_kind?: string
          id?: string
          is_current?: boolean
          opportunity_id?: string
          resume_version_id?: string
          selected_at?: string
          superseded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_resume_assignments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_resume_assignments_resume_version_id_fkey"
            columns: ["resume_version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_grants: {
        Row: {
          active: boolean
          capability_key: string
          created_at: string
          expires_at: string | null
          id: string
          mode: string
          operation_id: string | null
          starts_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          capability_key: string
          created_at?: string
          expires_at?: string | null
          id?: string
          mode?: string
          operation_id?: string | null
          starts_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          capability_key?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          mode?: string
          operation_id?: string | null
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_grants_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capability_definitions"
            referencedColumns: ["capability_key"]
          },
        ]
      }
      privacy_locks: {
        Row: {
          is_locked: boolean
          locked_at: string | null
          reason_code: string | null
          unlocked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          is_locked?: boolean
          locked_at?: string | null
          reason_code?: string | null
          unlocked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          is_locked?: boolean
          locked_at?: string | null
          reason_code?: string | null
          unlocked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_items: {
        Row: {
          action_id: string | null
          calendar_event_id: string | null
          created_at: string
          id: number
          item_state: string
          metadata: Json
          opportunity_id: string | null
          position: number
          reason: string | null
          report_id: string
          section: string
          source_type: string
          target_path: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_id?: string | null
          calendar_event_id?: string | null
          created_at?: string
          id?: never
          item_state?: string
          metadata?: Json
          opportunity_id?: string | null
          position: number
          reason?: string | null
          report_id: string
          section: string
          source_type: string
          target_path?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_id?: string | null
          calendar_event_id?: string | null
          created_at?: string
          id?: never
          item_state?: string
          metadata?: Json
          opportunity_id?: string | null
          position?: number
          reason?: string | null
          report_id?: string
          section?: string
          source_type?: string
          target_path?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_items_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_items_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_items_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_error_code: string | null
          last_run_at: string | null
          last_status: string
          local_time: string
          next_run_at: string | null
          report_type: string
          time_zone: string
          updated_at: string
          user_id: string
          weekday: number | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error_code?: string | null
          last_run_at?: string | null
          last_status?: string
          local_time: string
          next_run_at?: string | null
          report_type: string
          time_zone?: string
          updated_at?: string
          user_id: string
          weekday?: number | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_error_code?: string | null
          last_run_at?: string | null
          last_status?: string
          local_time?: string
          next_run_at?: string | null
          report_type?: string
          time_zone?: string
          updated_at?: string
          user_id?: string
          weekday?: number | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          automation_run_id: string | null
          created_at: string
          data_cutoff_at: string
          generated_at: string
          generation_strategy: string
          id: string
          report_date: string
          report_type: string
          source_health: Json
          status: string
          summary: string
          title: string
          user_id: string
          version: number
        }
        Insert: {
          automation_run_id?: string | null
          created_at?: string
          data_cutoff_at: string
          generated_at?: string
          generation_strategy?: string
          id?: string
          report_date: string
          report_type: string
          source_health?: Json
          status: string
          summary: string
          title: string
          user_id: string
          version: number
        }
        Update: {
          automation_run_id?: string | null
          created_at?: string
          data_cutoff_at?: string
          generated_at?: string
          generation_strategy?: string
          id?: string
          report_date?: string
          report_type?: string
          source_health?: Json
          status?: string
          summary?: string
          title?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reports_automation_run_id_fkey"
            columns: ["automation_run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_documents: {
        Row: {
          archived_at: string | null
          created_at: string
          document_kind: string
          id: string
          label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          document_kind: string
          id?: string
          label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          document_kind?: string
          id?: string
          label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resume_versions: {
        Row: {
          content_sha256: string
          created_at: string
          document_id: string
          extracted_character_count: number
          id: string
          mime_type: string
          original_filename: string
          page_count: number | null
          size_bytes: number
          source_version_id: string | null
          storage_path: string
          user_id: string
          version_number: number
        }
        Insert: {
          content_sha256: string
          created_at?: string
          document_id: string
          extracted_character_count: number
          id: string
          mime_type: string
          original_filename: string
          page_count?: number | null
          size_bytes: number
          source_version_id?: string | null
          storage_path: string
          user_id: string
          version_number: number
        }
        Update: {
          content_sha256?: string
          created_at?: string
          document_id?: string
          extracted_character_count?: number
          id?: string
          mime_type?: string
          original_filename?: string
          page_count?: number | null
          size_bytes?: number
          source_version_id?: string | null
          storage_path?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "resume_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "resume_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resume_versions_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "resume_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      search_documents: {
        Row: {
          body: string
          company: string | null
          deadline: string | null
          id: string
          indexed_at: string
          location: string | null
          object_id: string
          object_type: string
          search_text: string | null
          source_at: string | null
          source_kind: string
          source_url: string | null
          stage: string | null
          title: string
          track: string | null
          user_id: string
        }
        Insert: {
          body?: string
          company?: string | null
          deadline?: string | null
          id?: string
          indexed_at?: string
          location?: string | null
          object_id: string
          object_type: string
          search_text?: string | null
          source_at?: string | null
          source_kind: string
          source_url?: string | null
          stage?: string | null
          title: string
          track?: string | null
          user_id: string
        }
        Update: {
          body?: string
          company?: string | null
          deadline?: string | null
          id?: string
          indexed_at?: string
          location?: string | null
          object_id?: string
          object_type?: string
          search_text?: string | null
          source_at?: string | null
          source_kind?: string
          source_url?: string | null
          stage?: string | null
          title?: string
          track?: string | null
          user_id?: string
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_default: boolean
          name: string
          scope: string
          sort_spec: Json
          updated_at: string
          user_id: string
          visible_columns: string[]
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          name: string
          scope: string
          sort_spec?: Json
          updated_at?: string
          user_id: string
          visible_columns?: string[]
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          name?: string
          scope?: string
          sort_spec?: Json
          updated_at?: string
          user_id?: string
          visible_columns?: string[]
        }
        Relationships: []
      }
      sync_conflicts: {
        Row: {
          base_value: Json | null
          base_version: number
          client_mutation_id: string
          created_at: string
          field_path: string
          id: string
          local_value: Json | null
          object_id: string
          object_type: string
          resolution: string | null
          resolved_at: string | null
          resolved_value: Json | null
          server_record_version: number
          server_value: Json | null
          status: string
          user_id: string
        }
        Insert: {
          base_value?: Json | null
          base_version: number
          client_mutation_id: string
          created_at?: string
          field_path: string
          id?: string
          local_value?: Json | null
          object_id: string
          object_type: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_value?: Json | null
          server_record_version: number
          server_value?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          base_value?: Json | null
          base_version?: number
          client_mutation_id?: string
          created_at?: string
          field_path?: string
          id?: string
          local_value?: Json | null
          object_id?: string
          object_type?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_value?: Json | null
          server_record_version?: number
          server_value?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      timeline_entries: {
        Row: {
          actor_type: string
          changes: Json
          client_mutation_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          occurred_at: string
          summary: string
          user_id: string
        }
        Insert: {
          actor_type: string
          changes?: Json
          client_mutation_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          occurred_at?: string
          summary: string
          user_id: string
        }
        Update: {
          actor_type?: string
          changes?: Json
          client_mutation_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          occurred_at?: string
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      undo_operations: {
        Row: {
          attempted_at: string | null
          audit_event_id: string
          compensation_payload: Json
          completed_at: string | null
          created_at: string
          error_code: string | null
          expires_at: string | null
          id: string
          operation_type: string
          result_summary: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempted_at?: string | null
          audit_event_id: string
          compensation_payload?: Json
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          expires_at?: string | null
          id?: string
          operation_type: string
          result_summary?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempted_at?: string | null
          audit_event_id?: string
          compensation_payload?: Json
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          expires_at?: string | null
          id?: string
          operation_type?: string
          result_summary?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "undo_operations_audit_event_id_fkey"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "audit_events"
            referencedColumns: ["id"]
          },
        ]
      }
      wechat_allowlist_groups: {
        Row: {
          created_at: string
          display_label: string
          enabled: boolean
          id: string
          identity_fingerprint: string
          stable_group_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_label: string
          enabled?: boolean
          id?: string
          identity_fingerprint: string
          stable_group_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_label?: string
          enabled?: boolean
          id?: string
          identity_fingerprint?: string
          stable_group_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wechat_monitor_states: {
        Row: {
          created_at: string
          desired_state: string
          environment_summary: Json
          last_error_code: string | null
          last_heartbeat_at: string | null
          last_success_at: string | null
          monitor_version: string | null
          observed_state: string
          pause_reason: string | null
          stop_generation: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          desired_state?: string
          environment_summary?: Json
          last_error_code?: string | null
          last_heartbeat_at?: string | null
          last_success_at?: string | null
          monitor_version?: string | null
          observed_state?: string
          pause_reason?: string | null
          stop_generation?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          desired_state?: string
          environment_summary?: Json
          last_error_code?: string | null
          last_heartbeat_at?: string | null
          last_success_at?: string | null
          monitor_version?: string | null
          observed_state?: string
          pause_reason?: string | null
          stop_generation?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wechat_projections: {
        Row: {
          allowlist_group_id: string | null
          candidate_id: string | null
          capture_key: string
          captured_at: string
          company: string
          confidence: number
          content_hash: string
          created_at: string
          deadline: string | null
          evidence_excerpt: string
          evidence_id: string
          id: string
          inbox_item_id: string | null
          ingestion_mode: string
          location: string | null
          processing_status: string
          role_title: string
          rule_version: string
          source_kind: string
          source_url: string | null
          track: string
          user_id: string
        }
        Insert: {
          allowlist_group_id?: string | null
          candidate_id?: string | null
          capture_key: string
          captured_at: string
          company: string
          confidence: number
          content_hash: string
          created_at?: string
          deadline?: string | null
          evidence_excerpt: string
          evidence_id: string
          id?: string
          inbox_item_id?: string | null
          ingestion_mode?: string
          location?: string | null
          processing_status: string
          role_title: string
          rule_version?: string
          source_kind: string
          source_url?: string | null
          track: string
          user_id: string
        }
        Update: {
          allowlist_group_id?: string | null
          candidate_id?: string | null
          capture_key?: string
          captured_at?: string
          company?: string
          confidence?: number
          content_hash?: string
          created_at?: string
          deadline?: string | null
          evidence_excerpt?: string
          evidence_id?: string
          id?: string
          inbox_item_id?: string | null
          ingestion_mode?: string
          location?: string | null
          processing_status?: string
          role_title?: string
          rule_version?: string
          source_kind?: string
          source_url?: string | null
          track?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wechat_projection_group_owner_fk"
            columns: ["allowlist_group_id", "user_id"]
            isOneToOne: false
            referencedRelation: "wechat_allowlist_groups"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "wechat_projection_inbox_fk"
            columns: ["inbox_item_id"]
            isOneToOne: false
            referencedRelation: "inbox_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_projections_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "opportunity_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wechat_projections_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_refs"
            referencedColumns: ["id"]
          },
        ]
      }
      wechat_screenshot_intakes: {
        Row: {
          content_sha256: string
          created_at: string
          failure_code: string
          id: string
          mime_type: string
          processing_status: string
          retention_mode: string
          size_bytes: number
          source_deleted_at: string
          user_id: string
        }
        Insert: {
          content_sha256: string
          created_at?: string
          failure_code?: string
          id?: string
          mime_type: string
          processing_status?: string
          retention_mode?: string
          size_bytes: number
          source_deleted_at?: string
          user_id: string
        }
        Update: {
          content_sha256?: string
          created_at?: string
          failure_code?: string
          id?: string
          mime_type?: string
          processing_status?: string
          retention_mode?: string
          size_bytes?: number
          source_deleted_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_gmail_sync_work: { Args: { target_user_id: string; target_token: string }; Returns: Json }
      save_gmail_sync_work: { Args: { target_user_id: string; target_token: string; target_state: Json; target_release: boolean }; Returns: undefined }
      apply_gmail_interview_update: {
        Args: {
          target_inbox_item_id: string
          target_opportunity_id: string
          target_user_id: string
        }
        Returns: string
      }
      apply_workspace_mutation: {
        Args: {
          target_base_values: Json
          target_base_version: number
          target_device_id: string
          target_mutation_id: string
          target_object_id: string
          target_object_type: string
          target_patch: Json
        }
        Returns: Json
      }
      assign_my_opportunity_resume: {
        Args: {
          target_opportunity_id: string
          target_resume_version_id: string
        }
        Returns: string
      }
      before_user_created_single_user: { Args: { event: Json }; Returns: Json }
      clear_calendar_sync_cursor: {
        Args: { target_source_id: string }
        Returns: undefined
      }
      close_out_my_action: {
        Args: {
          target_action_id: string
          target_outcome: string
          target_reschedule_at?: string
        }
        Returns: Json
      }
      complete_goldman_sachs_job_source_run: {
        Args: {
          target_coverage_gap: string
          target_cursor_value: string
          target_items: Json
          target_query_fingerprint: string
          target_run_id: string
          target_status: string
        }
        Returns: Json
      }
      complete_my_ai_analysis: {
        Args: {
          target_actual_hkd_cents: number
          target_input_tokens: number
          target_model: string
          target_opportunity_id: string
          target_output_tokens: number
          target_prompt_version: string
          target_result: Json
          target_resume_version_id: string
          target_usage_event_id: string
        }
        Returns: string
      }
      create_my_wechat_allowlist_group: {
        Args: {
          target_display_label: string
          target_identity_fingerprint: string
          target_stable_group_key: string
        }
        Returns: string
      }
      create_my_wechat_file_import: {
        Args: {
          target_company: string
          target_content_sha256: string
          target_deadline: string
          target_evidence_excerpt: string
          target_location: string
          target_mime_type: string
          target_role_title: string
          target_size_bytes: number
          target_track: string
          target_user_id: string
        }
        Returns: {
          candidate_id: string
          created: boolean
          inbox_item_id: string
          wechat_projection_id: string
        }[]
      }
      create_my_wechat_manual_import: {
        Args: {
          target_company: string
          target_confirmed: boolean
          target_deadline: string
          target_evidence_excerpt: string
          target_location: string
          target_role_title: string
          target_source_kind: string
          target_source_url: string
          target_track: string
        }
        Returns: {
          candidate_id: string
          created: boolean
          inbox_item_id: string
          wechat_projection_id: string
        }[]
      }
      delete_calendar_oauth_credentials: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      delete_gmail_oauth_credentials: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      enqueue_my_smart_notification: {
        Args: {
          target_body: string
          target_dedupe_key: string
          target_notification_type: string
          target_path: string
          target_reason: string
          target_title: string
        }
        Returns: string
      }
      ensure_my_report_schedules: { Args: never; Returns: number }
      fail_my_ai_usage: {
        Args: { target_error_code: string; target_usage_event_id: string }
        Returns: undefined
      }
      finish_job_source_run: {
        Args: {
          target_coverage_gap?: string
          target_error_code?: string
          target_new_count: number
          target_observed_count: number
          target_run_id: string
          target_status: string
          target_updated_count: number
        }
        Returns: string
      }
      generate_my_report: {
        Args: { target_report_type: string }
        Returns: string
      }
      get_calendar_sync_cursor: {
        Args: { target_source_id: string }
        Returns: {
          query_fingerprint: string
          sync_token: string
        }[]
      }
      get_gmail_sync_cursor: {
        Args: { target_user_id: string }
        Returns: {
          history_id: string
          initial_query: string
          last_full_sync_at: string
        }[]
      }
      get_my_permission_decision: {
        Args: { capability_key: string; operation_id?: string }
        Returns: {
          allowed: boolean
          grant_id: string
          reason: string
        }[]
      }
      get_single_wechat_monitor_user_id: { Args: never; Returns: string }
      get_wechat_monitor_assignment: {
        Args: { target_user_id: string }
        Returns: Json
      }
      import_my_jd: {
        Args: {
          target_application_method: string
          target_applied_at: string
          target_company: string
          target_deadline: string
          target_department: string
          target_extraction_confidence: number
          target_extraction_gaps: string[]
          target_jd_fingerprint: string
          target_location: string
          target_parser_version: string
          target_posted_on: string
          target_raw_jd: string
          target_requirements: string
          target_responsibilities: string
          target_role_title: string
          target_source_url: string
          target_stage: string
          target_track: string
        }
        Returns: {
          created: boolean
          opportunity_id: string
          opportunity_track: string
        }[]
      }
      confirm_my_application_package_resume: {
        Args: { target_package_id: string; target_resume_version_id: string }
        Returns: undefined
      }
      create_my_application_package: {
        Args: {
          target_items: Json
          target_official_apply_url: string
          target_opportunity_id: string
          target_recommendation_reason: string
          target_recommended_resume_version_id: string
          target_rule_version: string
          target_suggested_start_on: string
        }
        Returns: {
          created: boolean
          package_id: string
        }[]
      }
      set_my_application_package_item: {
        Args: { target_done: boolean; target_item_id: string }
        Returns: undefined
      }
      set_my_application_package_status: {
        Args: { target_package_id: string; target_status: string }
        Returns: undefined
      }
      record_my_application_submitted: {
        Args: {
          target_answers_text: string
          target_application_reference: string
          target_opportunity_id: string
          target_submitted_on: string
        }
        Returns: string
      }
      undo_my_application_submitted: {
        Args: { target_snapshot_id: string }
        Returns: undefined
      }
      rebuild_my_search_documents: { Args: never; Returns: number }
      search_my_workspace: {
        Args: {
          target_company?: string
          target_deadline_from?: string
          target_deadline_to?: string
          target_limit?: number
          target_location?: string
          target_query: string
          target_stage?: string
          target_track?: string
          target_types?: string[]
        }
        Returns: {
          company: string | null
          deadline: string | null
          indexed_at: string
          location: string | null
          object_id: string
          object_type: string
          score: number
          snippet: string
          source_at: string | null
          source_kind: string
          source_url: string | null
          stage: string | null
          title: string
          track: string | null
        }[]
      }
      decide_my_communication_link: {
        Args: { target_decision: string; target_link_id: string }
        Returns: string
      }
      decide_my_candidates: {
        Args: { target_candidate_ids: string[]; target_decision: string; target_reason?: string }
        Returns: { candidate_id: string; error_code: string | null; opportunity_id: string | null; outcome: string }[]
      }
      import_my_internship_jd:
        | {
            Args: {
              target_application_method: string
              target_applied_at: string
              target_company: string
              target_deadline: string
              target_department: string
              target_extraction_confidence: number
              target_extraction_gaps: string[]
              target_jd_fingerprint: string
              target_location: string
              target_parser_version: string
              target_posted_on: string
              target_raw_jd: string
              target_requirements: string
              target_responsibilities: string
              target_role_title: string
              target_source_url: string
              target_stage: string
            }
            Returns: {
              created: boolean
              opportunity_id: string
            }[]
          }
        | {
            Args: {
              target_application_method: string
              target_applied_at: string
              target_company: string
              target_deadline: string
              target_department: string
              target_extraction_confidence: number
              target_extraction_gaps: string[]
              target_jd_fingerprint: string
              target_location: string
              target_parser_version: string
              target_raw_jd: string
              target_requirements: string
              target_responsibilities: string
              target_role_title: string
              target_source_url: string
              target_stage: string
              target_work_mode: string
            }
            Returns: {
              created: boolean
              opportunity_id: string
            }[]
          }
      pair_wechat_visible_group: {
        Args: {
          target_display_label: string
          target_identity_fingerprint: string
          target_stable_group_key: string
          target_user_id: string
          target_wechat_version: string
        }
        Returns: {
          created: boolean
          group_id: string
        }[]
      }
      promote_opportunity_candidate: {
        Args: { target_candidate_id: string; target_intent: string }
        Returns: string
      }
      propose_job_source: {
        Args: {
          target_adapter_version: string
          target_base_url: string
          target_coverage_scope: string
          target_display_name: string
          target_polling_interval_minutes: number
          target_source_domain: string
          target_source_key: string
          target_source_kind: string
          target_usage_note: string
          target_user_id: string
        }
        Returns: string
      }
      queue_action_calendar_sync: {
        Args: { target_action_id: string; target_all_day?: boolean }
        Returns: string
      }
      read_calendar_oauth_credentials: {
        Args: { target_user_id: string }
        Returns: string
      }
      read_gmail_oauth_credentials: {
        Args: { target_user_id: string }
        Returns: string
      }
      reconcile_my_permissions: { Args: never; Returns: number }
      record_my_wechat_screenshot_intake: {
        Args: {
          target_content_sha256: string
          target_mime_type: string
          target_size_bytes: number
          target_user_id: string
        }
        Returns: {
          created: boolean
          screenshot_intake_id: string
        }[]
      }
      register_my_resume_version: {
        Args: {
          target_content_sha256: string
          target_document_id: string
          target_document_kind: string
          target_extracted_character_count: number
          target_label: string
          target_mime_type: string
          target_original_filename: string
          target_page_count: number
          target_size_bytes: number
          target_source_version_id: string
          target_storage_path: string
          target_version_id: string
        }
        Returns: {
          document_id: string
          version_id: string
          version_number: number
        }[]
      }
      report_wechat_monitor_heartbeat: {
        Args: {
          target_environment_summary: Json
          target_last_error_code: string
          target_monitor_version: string
          target_observed_state: string
          target_pause_reason: string
          target_stop_generation: number
          target_user_id: string
        }
        Returns: Json
      }
      reserve_my_ai_usage: {
        Args: {
          target_analysis_kind: string
          target_input_fingerprint: string
          target_reserve_hkd_cents: number
        }
        Returns: string
      }
      resolve_calendar_sync_conflict: {
        Args: { target_conflict_id: string; target_resolution: string }
        Returns: string
      }
      resolve_my_inbox_item: {
        Args: { target_item_id: string; target_resolution: string }
        Returns: string
      }
      resolve_sync_conflict: {
        Args: {
          target_conflict_id: string
          target_manual_value?: Json
          target_resolution: string
        }
        Returns: Json
      }
      review_my_job_source: {
        Args: {
          target_action: string
          target_polling_interval_minutes?: number
          target_source_id: string
        }
        Returns: string
      }
      set_calendar_sync_cursor: {
        Args: {
          target_query_fingerprint: string
          target_source_id: string
          target_sync_token: string
          target_user_id: string
        }
        Returns: undefined
      }
      set_gmail_sync_cursor: {
        Args: {
          target_full_sync?: boolean
          target_history_id: string
          target_user_id: string
        }
        Returns: undefined
      }
      set_my_calendar_connection_status: {
        Args: { target_status: string }
        Returns: string
      }
      set_my_gmail_connection_status: {
        Args: { target_status: string }
        Returns: string
      }
      set_my_wechat_allowlist_group: {
        Args: {
          target_display_label: string
          target_enabled: boolean
          target_group_id: string
        }
        Returns: Json
      }
      set_my_wechat_monitor_state: {
        Args: { target_state: string }
        Returns: Json
      }
      start_job_source_run: {
        Args: {
          target_run_key: string
          target_source_id: string
          target_user_id: string
        }
        Returns: string
      }
      store_calendar_oauth_credentials: {
        Args: {
          target_expires_at: string
          target_scopes: string[]
          target_secret_payload: string
          target_user_id: string
        }
        Returns: string
      }
      store_gmail_oauth_credentials: {
        Args: {
          target_expires_at: string
          target_scopes: string[]
          target_secret_payload: string
          target_user_id: string
        }
        Returns: string
      }
      store_gmail_projection: {
        Args: {
          target_action_due_at: string
          target_action_title: string
          target_attachments?: Json
          target_classification: string
          target_confidence: number
          target_content_hash: string
          target_evidence_excerpt: string
          target_gmail_link: string
          target_history_id: string
          target_inbox_classification: string
          target_inbox_summary: string
          target_inbox_title: string
          target_item_type: string
          target_needs_action: boolean
          target_provider_message_id: string
          target_provider_thread_id: string
          target_received_at: string
          target_sender_summary: string
          target_source_identity: string
          target_subject: string
          target_summary: string
          target_target_id: string
          target_target_type: string
          target_user_id: string
        }
        Returns: {
          created: boolean
          gmail_message_id: string
          inbox_item_id: string
        }[]
      }
      store_wechat_projection: {
        Args: {
          target_allowlist_group_id: string
          target_capture_key: string
          target_captured_at: string
          target_company: string
          target_confidence: number
          target_content_hash: string
          target_deadline: string
          target_evidence_excerpt: string
          target_identity_fingerprint: string
          target_location: string
          target_role_title: string
          target_source_kind: string
          target_stop_generation: number
          target_track: string
          target_user_id: string
        }
        Returns: {
          candidate_id: string
          created: boolean
          inbox_item_id: string
          wechat_projection_id: string
        }[]
      }
      undo_my_gmail_update: {
        Args: { target_update_id: string }
        Returns: boolean
      }
      update_my_report_schedule: {
        Args: {
          target_enabled: boolean
          target_local_time: string
          target_report_type: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
