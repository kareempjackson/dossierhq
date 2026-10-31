export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      ask_answers: {
        Row: {
          answered: boolean | null;
          asked_at: string;
          asked_by: string | null;
          asked_by_name: string;
          clients: Json;
          cost: number | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          lines: Json;
          model: string | null;
          question: string;
          sources: Json;
          status: string;
          workspace_id: string;
        };
        Insert: {
          answered?: boolean | null;
          asked_at: string;
          asked_by?: string | null;
          asked_by_name: string;
          clients?: Json;
          cost?: number | null;
          error?: string | null;
          finished_at?: string | null;
          id: string;
          lines?: Json;
          model?: string | null;
          question: string;
          sources?: Json;
          status: string;
          workspace_id: string;
        };
        Update: {
          answered?: boolean | null;
          asked_at?: string;
          asked_by?: string | null;
          asked_by_name?: string;
          clients?: Json;
          cost?: number | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          lines?: Json;
          model?: string | null;
          question?: string;
          sources?: Json;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ask_answers_asked_by_fkey';
            columns: ['asked_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ask_answers_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      attention_items: {
        Row: {
          client_id: string | null;
          id: string;
          kind: string;
          raised_at: string;
          source_ids: string[];
          title: string;
          tool: string | null;
          urgency: string;
          workspace_id: string;
        };
        Insert: {
          client_id?: string | null;
          id: string;
          kind: string;
          raised_at: string;
          source_ids: string[];
          title: string;
          tool?: string | null;
          urgency: string;
          workspace_id: string;
        };
        Update: {
          client_id?: string | null;
          id?: string;
          kind?: string;
          raised_at?: string;
          source_ids?: string[];
          title?: string;
          tool?: string | null;
          urgency?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attention_items_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'attention_items_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attention_items_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_entries: {
        Row: {
          actor_email: string | null;
          actor_name: string | null;
          actor_user_id: string | null;
          at: string;
          client_id: string | null;
          id: string;
          ip: string | null;
          kind: string;
          outcome: string;
          record_count: number;
          tool: string | null;
          what: string;
          workspace_id: string;
        };
        Insert: {
          actor_email?: string | null;
          actor_name?: string | null;
          actor_user_id?: string | null;
          at: string;
          client_id?: string | null;
          id: string;
          ip?: string | null;
          kind: string;
          outcome: string;
          record_count: number;
          tool?: string | null;
          what: string;
          workspace_id: string;
        };
        Update: {
          actor_email?: string | null;
          actor_name?: string | null;
          actor_user_id?: string | null;
          at?: string;
          client_id?: string | null;
          id?: string;
          ip?: string | null;
          kind?: string;
          outcome?: string;
          record_count?: number;
          tool?: string | null;
          what?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_entries_actor_user_id_fkey';
            columns: ['actor_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_entries_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      client_links: {
        Row: {
          client_id: string;
          external_id: string;
          name: string;
          tool: string;
          url: string;
          workspace_id: string;
        };
        Insert: {
          client_id: string;
          external_id: string;
          name: string;
          tool: string;
          url: string;
          workspace_id: string;
        };
        Update: {
          client_id?: string;
          external_id?: string;
          name?: string;
          tool?: string;
          url?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_links_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'client_links_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_links_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      client_recipients: {
        Row: {
          client_id: string;
          copy: boolean;
          email: string;
          name: string;
          position: number;
          workspace_id: string;
        };
        Insert: {
          client_id: string;
          copy?: boolean;
          email: string;
          name?: string;
          position: number;
          workspace_id: string;
        };
        Update: {
          client_id?: string;
          copy?: boolean;
          email?: string;
          name?: string;
          position?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_recipients_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'client_recipients_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_recipients_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      client_views: {
        Row: {
          client_id: string;
          viewed_at: string;
          workspace_id: string;
        };
        Insert: {
          client_id: string;
          viewed_at?: string;
          workspace_id: string;
        };
        Update: {
          client_id?: string;
          viewed_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_views_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'client_views_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_views_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      clients: {
        Row: {
          contact_name: string | null;
          contact_role: string | null;
          contract_currency: string | null;
          contract_includes: string[] | null;
          contract_monthly_fee: number | null;
          contract_plan: string | null;
          contract_renews_on: string | null;
          contract_started_on: string | null;
          created_at: string;
          domains: string[];
          id: string;
          industry: string | null;
          location: string | null;
          name: string;
          seats: number | null;
          workspace_id: string;
        };
        Insert: {
          contact_name?: string | null;
          contact_role?: string | null;
          contract_currency?: string | null;
          contract_includes?: string[] | null;
          contract_monthly_fee?: number | null;
          contract_plan?: string | null;
          contract_renews_on?: string | null;
          contract_started_on?: string | null;
          created_at?: string;
          domains?: string[];
          id: string;
          industry?: string | null;
          location?: string | null;
          name: string;
          seats?: number | null;
          workspace_id: string;
        };
        Update: {
          contact_name?: string | null;
          contact_role?: string | null;
          contract_currency?: string | null;
          contract_includes?: string[] | null;
          contract_monthly_fee?: number | null;
          contract_plan?: string | null;
          contract_renews_on?: string | null;
          contract_started_on?: string | null;
          created_at?: string;
          domains?: string[];
          id?: string;
          industry?: string | null;
          location?: string | null;
          name?: string;
          seats?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clients_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      commitments: {
        Row: {
          client_id: string;
          completed_at: string | null;
          due_on: string | null;
          id: string;
          made_at: string;
          source_ids: string[];
          statement: string;
          status: string;
          tool: string | null;
          workspace_id: string;
        };
        Insert: {
          client_id: string;
          completed_at?: string | null;
          due_on?: string | null;
          id: string;
          made_at: string;
          source_ids: string[];
          statement: string;
          status: string;
          tool?: string | null;
          workspace_id: string;
        };
        Update: {
          client_id?: string;
          completed_at?: string | null;
          due_on?: string | null;
          id?: string;
          made_at?: string;
          source_ids?: string[];
          statement?: string;
          status?: string;
          tool?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'commitments_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'commitments_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'commitments_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      connectors: {
        Row: {
          access: string;
          account: string;
          credentials: string;
          failure: Json | null;
          id: string;
          last_sync_at: string | null;
          scope: string;
          state: Json;
          status: string;
          tool: string;
          workspace_id: string;
        };
        Insert: {
          access: string;
          account?: string;
          credentials?: string;
          failure?: Json | null;
          id: string;
          last_sync_at?: string | null;
          scope: string;
          state?: Json;
          status: string;
          tool: string;
          workspace_id: string;
        };
        Update: {
          access?: string;
          account?: string;
          credentials?: string;
          failure?: Json | null;
          id?: string;
          last_sync_at?: string | null;
          scope?: string;
          state?: Json;
          status?: string;
          tool?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'connectors_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      contract_documents: {
        Row: {
          client_id: string;
          content: string;
          content_type: string;
          id: string;
          name: string;
          size: number;
          uploaded_at: string;
          uploaded_by: string | null;
          uploaded_by_name: string;
          workspace_id: string;
        };
        Insert: {
          client_id: string;
          content: string;
          content_type: string;
          id: string;
          name: string;
          size: number;
          uploaded_at: string;
          uploaded_by?: string | null;
          uploaded_by_name: string;
          workspace_id: string;
        };
        Update: {
          client_id?: string;
          content?: string;
          content_type?: string;
          id?: string;
          name?: string;
          size?: number;
          uploaded_at?: string;
          uploaded_by?: string | null;
          uploaded_by_name?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contract_documents_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'contract_documents_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_documents_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contract_documents_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      devices: {
        Row: {
          assigned_to: string | null;
          client_id: string;
          id: string;
          last_seen_at: string;
          name: string;
          os: string;
          patch_status: string;
          source_id: string;
          tool: string | null;
          type: string;
          workspace_id: string;
        };
        Insert: {
          assigned_to?: string | null;
          client_id: string;
          id: string;
          last_seen_at: string;
          name: string;
          os: string;
          patch_status: string;
          source_id: string;
          tool?: string | null;
          type: string;
          workspace_id: string;
        };
        Update: {
          assigned_to?: string | null;
          client_id?: string;
          id?: string;
          last_seen_at?: string;
          name?: string;
          os?: string;
          patch_status?: string;
          source_id?: string;
          tool?: string | null;
          type?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'devices_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'devices_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'devices_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          actor_user_id: string | null;
          attempts: number;
          dedupe_key: string | null;
          dispatched_at: string | null;
          failed_at: string | null;
          id: string;
          last_error: string | null;
          locked_until: string | null;
          next_attempt_at: string;
          occurred_at: string;
          payload: Json;
          type: string;
          workspace_id: string;
        };
        Insert: {
          actor_user_id?: string | null;
          attempts?: number;
          dedupe_key?: string | null;
          dispatched_at?: string | null;
          failed_at?: string | null;
          id: string;
          last_error?: string | null;
          locked_until?: string | null;
          next_attempt_at: string;
          occurred_at: string;
          payload?: Json;
          type: string;
          workspace_id: string;
        };
        Update: {
          actor_user_id?: string | null;
          attempts?: number;
          dedupe_key?: string | null;
          dispatched_at?: string | null;
          failed_at?: string | null;
          id?: string;
          last_error?: string | null;
          locked_until?: string | null;
          next_attempt_at?: string;
          occurred_at?: string;
          payload?: Json;
          type?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'events_actor_user_id_fkey';
            columns: ['actor_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      intelligence_runs: {
        Row: {
          client_id: string | null;
          cost: number;
          error: string | null;
          finished_at: string;
          id: string;
          input_hash: string | null;
          kind: string;
          model: string;
          started_at: string;
          status: string;
          usage: Json;
          workspace_id: string;
        };
        Insert: {
          client_id?: string | null;
          cost: number;
          error?: string | null;
          finished_at: string;
          id: string;
          input_hash?: string | null;
          kind: string;
          model: string;
          started_at: string;
          status: string;
          usage: Json;
          workspace_id: string;
        };
        Update: {
          client_id?: string | null;
          cost?: number;
          error?: string | null;
          finished_at?: string;
          id?: string;
          input_hash?: string | null;
          kind?: string;
          model?: string;
          started_at?: string;
          status?: string;
          usage?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'intelligence_runs_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'intelligence_runs_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'intelligence_runs_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      invites: {
        Row: {
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          invited_by_name: string;
          role: string;
          token_hash: string;
          workspace_id: string;
        };
        Insert: {
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by?: string | null;
          invited_by_name: string;
          role: string;
          token_hash: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          invited_by_name?: string;
          role?: string;
          token_hash?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      meeting_notes: {
        Row: {
          added_by: string | null;
          added_by_name: string;
          attendees: string[];
          body: string;
          client_id: string | null;
          created_at: string;
          id: string;
          occurred_on: string;
          title: string;
          via: string;
          workspace_id: string;
        };
        Insert: {
          added_by?: string | null;
          added_by_name: string;
          attendees?: string[];
          body: string;
          client_id?: string | null;
          created_at: string;
          id: string;
          occurred_on: string;
          title: string;
          via: string;
          workspace_id: string;
        };
        Update: {
          added_by?: string | null;
          added_by_name?: string;
          attendees?: string[];
          body?: string;
          client_id?: string | null;
          created_at?: string;
          id?: string;
          occurred_on?: string;
          title?: string;
          via?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meeting_notes_added_by_fkey';
            columns: ['added_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_notes_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'meeting_notes_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_notes_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      meeting_points: {
        Row: {
          asked_for: Json;
          attempted_at: string;
          concerns: Json;
          id: string;
          input_hash: string;
          meeting_id: string | null;
          missing_since: string | null;
          note_id: string | null;
          planning: Json;
          read_at: string | null;
          run_id: string | null;
          status: string;
          workspace_id: string;
        };
        Insert: {
          asked_for?: Json;
          attempted_at: string;
          concerns?: Json;
          id: string;
          input_hash: string;
          meeting_id?: string | null;
          missing_since?: string | null;
          note_id?: string | null;
          planning?: Json;
          read_at?: string | null;
          run_id?: string | null;
          status: string;
          workspace_id: string;
        };
        Update: {
          asked_for?: Json;
          attempted_at?: string;
          concerns?: Json;
          id?: string;
          input_hash?: string;
          meeting_id?: string | null;
          missing_since?: string | null;
          note_id?: string | null;
          planning?: Json;
          read_at?: string | null;
          run_id?: string | null;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meeting_points_note_id_fkey';
            columns: ['note_id'];
            isOneToOne: false;
            referencedRelation: 'meeting_notes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meeting_points_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      meetings: {
        Row: {
          asked_for: Json;
          attendees: Json;
          client_id: string;
          concerns: Json;
          duration_minutes: number;
          id: string;
          occurred_at: string;
          planning: Json;
          recording_source_id: string;
          title: string;
          tool: string | null;
          workspace_id: string;
        };
        Insert: {
          asked_for?: Json;
          attendees: Json;
          client_id: string;
          concerns?: Json;
          duration_minutes: number;
          id: string;
          occurred_at: string;
          planning?: Json;
          recording_source_id: string;
          title: string;
          tool?: string | null;
          workspace_id: string;
        };
        Update: {
          asked_for?: Json;
          attendees?: Json;
          client_id?: string;
          concerns?: Json;
          duration_minutes?: number;
          id?: string;
          occurred_at?: string;
          planning?: Json;
          recording_source_id?: string;
          title?: string;
          tool?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meetings_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'meetings_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meetings_recording_source_id_fkey';
            columns: ['recording_source_id'];
            isOneToOne: false;
            referencedRelation: 'sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meetings_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      notes_inboxes: {
        Row: {
          created_at: string;
          token: string;
          workspace_id: string;
        };
        Insert: {
          created_at: string;
          token: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          token?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notes_inboxes_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string;
          email: boolean;
          email_claimed_at: string | null;
          email_sent_at: string | null;
          event_id: string;
          id: string;
          in_app: boolean;
          link: string | null;
          read_at: string | null;
          title: string;
          type: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          body?: string;
          created_at: string;
          email?: boolean;
          email_claimed_at?: string | null;
          email_sent_at?: string | null;
          event_id: string;
          id: string;
          in_app?: boolean;
          link?: string | null;
          read_at?: string | null;
          title: string;
          type: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          email?: boolean;
          email_claimed_at?: string | null;
          email_sent_at?: string | null;
          event_id?: string;
          id?: string;
          in_app?: boolean;
          link?: string | null;
          read_at?: string | null;
          title?: string;
          type?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      password_resets: {
        Row: {
          created_at: string;
          expires_at: string;
          token_hash: string;
          used_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at: string;
          expires_at: string;
          token_hash: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          token_hash?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'password_resets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      patterns: {
        Row: {
          clients: Json;
          created_at: string;
          id: string;
          position: number;
          suggestion: string;
          title: string;
          why: string;
          workspace_id: string;
        };
        Insert: {
          clients: Json;
          created_at: string;
          id: string;
          position: number;
          suggestion: string;
          title: string;
          why: string;
          workspace_id: string;
        };
        Update: {
          clients?: Json;
          created_at?: string;
          id?: string;
          position?: number;
          suggestion?: string;
          title?: string;
          why?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'patterns_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      rate_limit_hits: {
        Row: {
          at: string;
          bucket: string;
          id: number;
        };
        Insert: {
          at: string;
          bucket: string;
          id?: never;
        };
        Update: {
          at?: string;
          bucket?: string;
          id?: never;
        };
        Relationships: [];
      };
      recommendations: {
        Row: {
          client_id: string;
          created_at: string;
          decided_at: string | null;
          edited: boolean;
          id: string;
          reason: string;
          run_id: string | null;
          source_ids: string[];
          status: string;
          title: string;
          workspace_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          decided_at?: string | null;
          edited?: boolean;
          id: string;
          reason: string;
          run_id?: string | null;
          source_ids: string[];
          status: string;
          title: string;
          workspace_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          decided_at?: string | null;
          edited?: boolean;
          id?: string;
          reason?: string;
          run_id?: string | null;
          source_ids?: string[];
          status?: string;
          title?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recommendations_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'recommendations_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recommendations_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      report_deliveries: {
        Row: {
          at: string;
          cc_addresses: string[];
          client_id: string;
          id: string;
          message_id: string | null;
          outcome: string;
          problem: string | null;
          report_id: string;
          sent_by: string | null;
          sent_by_name: string | null;
          to_addresses: string[];
          workspace_id: string;
        };
        Insert: {
          at: string;
          cc_addresses?: string[];
          client_id: string;
          id: string;
          message_id?: string | null;
          outcome: string;
          problem?: string | null;
          report_id: string;
          sent_by?: string | null;
          sent_by_name?: string | null;
          to_addresses: string[];
          workspace_id: string;
        };
        Update: {
          at?: string;
          cc_addresses?: string[];
          client_id?: string;
          id?: string;
          message_id?: string | null;
          outcome?: string;
          problem?: string | null;
          report_id?: string;
          sent_by?: string | null;
          sent_by_name?: string | null;
          to_addresses?: string[];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'report_deliveries_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'report_deliveries_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'report_deliveries_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'report_deliveries_sent_by_fkey';
            columns: ['sent_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'report_deliveries_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      report_questions: {
        Row: {
          client_id: string | null;
          created_at: string;
          id: string;
          text: string;
          workspace_id: string;
        };
        Insert: {
          client_id?: string | null;
          created_at: string;
          id: string;
          text: string;
          workspace_id: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          id?: string;
          text?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'report_questions_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'report_questions_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'report_questions_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      report_settings: {
        Row: {
          brand_colour: string;
          draft_hour: number | null;
          draft_weekday: number | null;
          drafted_week: string | null;
          logo: string | null;
          logo_type: string | null;
          reply_to: string | null;
          send_from: string | null;
          send_hour: number | null;
          send_weekday: number | null;
          sender_name: string;
          workspace_id: string;
        };
        Insert: {
          brand_colour?: string;
          draft_hour?: number | null;
          draft_weekday?: number | null;
          drafted_week?: string | null;
          logo?: string | null;
          logo_type?: string | null;
          reply_to?: string | null;
          send_from?: string | null;
          send_hour?: number | null;
          send_weekday?: number | null;
          sender_name?: string;
          workspace_id: string;
        };
        Update: {
          brand_colour?: string;
          draft_hour?: number | null;
          draft_weekday?: number | null;
          drafted_week?: string | null;
          logo?: string | null;
          logo_type?: string | null;
          reply_to?: string | null;
          send_from?: string | null;
          send_hour?: number | null;
          send_weekday?: number | null;
          sender_name?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'report_settings_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          approved_at: string | null;
          client_id: string;
          edited_at: string | null;
          exceptions: string[];
          generated_at: string;
          glance: Json;
          id: string;
          sections: Json;
          sent_at: string | null;
          sources: Json;
          status: string;
          title: string;
          week_end: string;
          week_start: string;
          workspace_id: string;
        };
        Insert: {
          approved_at?: string | null;
          client_id: string;
          edited_at?: string | null;
          exceptions?: string[];
          generated_at: string;
          glance?: Json;
          id: string;
          sections?: Json;
          sent_at?: string | null;
          sources?: Json;
          status: string;
          title: string;
          week_end: string;
          week_start: string;
          workspace_id: string;
        };
        Update: {
          approved_at?: string | null;
          client_id?: string;
          edited_at?: string | null;
          exceptions?: string[];
          generated_at?: string;
          glance?: Json;
          id?: string;
          sections?: Json;
          sent_at?: string | null;
          sources?: Json;
          status?: string;
          title?: string;
          week_end?: string;
          week_start?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'reports_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      sessions: {
        Row: {
          created_at: string;
          expires_at: string;
          last_seen_at: string;
          token_hash: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          last_seen_at: string;
          token_hash: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          last_seen_at?: string;
          token_hash?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      sources: {
        Row: {
          client_id: string | null;
          fields: Json;
          id: string;
          kind: string;
          meeting_id: string | null;
          note_id: string | null;
          quote: string | null;
          record_id: string;
          record_type: string;
          recorded_at: string;
          speaker_name: string | null;
          speaker_role: string | null;
          title: string;
          tool: string | null;
          transcript_at: string | null;
          url: string;
          workspace_id: string;
        };
        Insert: {
          client_id?: string | null;
          fields?: Json;
          id: string;
          kind: string;
          meeting_id?: string | null;
          note_id?: string | null;
          quote?: string | null;
          record_id: string;
          record_type: string;
          recorded_at: string;
          speaker_name?: string | null;
          speaker_role?: string | null;
          title: string;
          tool?: string | null;
          transcript_at?: string | null;
          url: string;
          workspace_id: string;
        };
        Update: {
          client_id?: string | null;
          fields?: Json;
          id?: string;
          kind?: string;
          meeting_id?: string | null;
          note_id?: string | null;
          quote?: string | null;
          record_id?: string;
          record_type?: string;
          recorded_at?: string;
          speaker_name?: string | null;
          speaker_role?: string | null;
          title?: string;
          tool?: string | null;
          transcript_at?: string | null;
          url?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sources_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'sources_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sources_note_id_fkey';
            columns: ['note_id'];
            isOneToOne: false;
            referencedRelation: 'meeting_notes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sources_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_audit: {
        Row: {
          at: string;
          id: string;
          ip: string | null;
          outcome: string;
          staff_email: string | null;
          staff_id: string | null;
          staff_name: string | null;
          user_id: string | null;
          what: string;
          workspace_id: string | null;
        };
        Insert: {
          at: string;
          id: string;
          ip?: string | null;
          outcome: string;
          staff_email?: string | null;
          staff_id?: string | null;
          staff_name?: string | null;
          user_id?: string | null;
          what: string;
          workspace_id?: string | null;
        };
        Update: {
          at?: string;
          id?: string;
          ip?: string | null;
          outcome?: string;
          staff_email?: string | null;
          staff_id?: string | null;
          staff_name?: string | null;
          user_id?: string | null;
          what?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_audit_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_invites: {
        Row: {
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          invited_by_name: string;
          role: string;
          token_hash: string;
        };
        Insert: {
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by?: string | null;
          invited_by_name: string;
          role: string;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          invited_by_name?: string;
          role?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_sessions: {
        Row: {
          created_at: string;
          expires_at: string;
          last_seen_at: string;
          staff_id: string;
          token_hash: string;
        };
        Insert: {
          created_at: string;
          expires_at: string;
          last_seen_at: string;
          staff_id: string;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          last_seen_at?: string;
          staff_id?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'staff_sessions_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_users: {
        Row: {
          created_at: string;
          disabled_at: string | null;
          email: string;
          id: string;
          name: string;
          password_hash: string;
          recovery_hashes: string[];
          role: string;
          totp_last_step: number | null;
          totp_secret: string;
        };
        Insert: {
          created_at: string;
          disabled_at?: string | null;
          email: string;
          id: string;
          name: string;
          password_hash: string;
          recovery_hashes?: string[];
          role: string;
          totp_last_step?: number | null;
          totp_secret: string;
        };
        Update: {
          created_at?: string;
          disabled_at?: string | null;
          email?: string;
          id?: string;
          name?: string;
          password_hash?: string;
          recovery_hashes?: string[];
          role?: string;
          totp_last_step?: number | null;
          totp_secret?: string;
        };
        Relationships: [];
      };
      support_grants: {
        Row: {
          acting_user_id: string | null;
          created_at: string;
          ended_at: string | null;
          ended_by: string | null;
          expires_at: string;
          handoff_expires_at: string;
          handoff_hash: string | null;
          id: string;
          reason: string;
          redeemed_at: string | null;
          session_hash: string | null;
          staff_email: string;
          staff_id: string | null;
          staff_name: string;
          workspace_id: string;
          workspace_name: string;
        };
        Insert: {
          acting_user_id?: string | null;
          created_at: string;
          ended_at?: string | null;
          ended_by?: string | null;
          expires_at: string;
          handoff_expires_at: string;
          handoff_hash?: string | null;
          id: string;
          reason: string;
          redeemed_at?: string | null;
          session_hash?: string | null;
          staff_email: string;
          staff_id?: string | null;
          staff_name: string;
          workspace_id: string;
          workspace_name: string;
        };
        Update: {
          acting_user_id?: string | null;
          created_at?: string;
          ended_at?: string | null;
          ended_by?: string | null;
          expires_at?: string;
          handoff_expires_at?: string;
          handoff_hash?: string | null;
          id?: string;
          reason?: string;
          redeemed_at?: string | null;
          session_hash?: string | null;
          staff_email?: string;
          staff_id?: string | null;
          staff_name?: string;
          workspace_id?: string;
          workspace_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_grants_acting_user_id_fkey';
            columns: ['acting_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_grants_staff_id_fkey';
            columns: ['staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_grants_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      tickets: {
        Row: {
          assigned_to: string | null;
          client_id: string;
          id: string;
          number: string;
          open: boolean;
          opened_at: string;
          requester: string | null;
          source_id: string;
          status: string;
          subject: string;
          tool: string | null;
          updated_at: string;
          urgency: string;
          workspace_id: string;
        };
        Insert: {
          assigned_to?: string | null;
          client_id: string;
          id: string;
          number: string;
          open: boolean;
          opened_at: string;
          requester?: string | null;
          source_id: string;
          status: string;
          subject: string;
          tool?: string | null;
          updated_at: string;
          urgency: string;
          workspace_id: string;
        };
        Update: {
          assigned_to?: string | null;
          client_id?: string;
          id?: string;
          number?: string;
          open?: boolean;
          opened_at?: string;
          requester?: string | null;
          source_id?: string;
          status?: string;
          subject?: string;
          tool?: string | null;
          updated_at?: string;
          urgency?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tickets_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'tickets_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tickets_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tickets_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      user_mfa: {
        Row: {
          created_at: string;
          enabled_at: string | null;
          last_step: number | null;
          recovery_hashes: string[];
          secret: string;
          user_id: string;
        };
        Insert: {
          created_at: string;
          enabled_at?: string | null;
          last_step?: number | null;
          recovery_hashes?: string[];
          secret: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          enabled_at?: string | null;
          last_step?: number | null;
          recovery_hashes?: string[];
          secret?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_mfa_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          name: string;
          password_hash: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id: string;
          name: string;
          password_hash: string;
          title?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          password_hash?: string;
          title?: string;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          notification_preferences: Json | null;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          notification_preferences?: Json | null;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          notification_preferences?: Json | null;
          role?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          id: string;
          intelligence_model: string | null;
          intelligence_preferences: Json | null;
          name: string;
          suspended_at: string | null;
          suspended_reason: string | null;
          time_zone: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          intelligence_model?: string | null;
          intelligence_preferences?: Json | null;
          name: string;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          time_zone: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          intelligence_model?: string | null;
          intelligence_preferences?: Json | null;
          name?: string;
          suspended_at?: string | null;
          suspended_reason?: string | null;
          time_zone?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      client_overview: {
        Row: {
          attention_critical: number | null;
          attention_high: number | null;
          attention_total: number | null;
          client_id: string | null;
          last_meeting_at: string | null;
          latest_report_id: string | null;
          workspace_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'clients_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      accept_invite: {
        Args: { p_now: string; p_token_hash: string; p_user: Json };
        Returns: string;
      };
      accept_staff_invite: {
        Args: { p_now: string; p_staff: Json; p_token_hash: string };
        Returns: string;
      };
      add_contract_document: {
        Args: { p_content: string; p_row: Json };
        Returns: undefined;
      };
      add_meeting_note: {
        Args: { p_note: Json; p_source: Json; p_workspace_id: string };
        Returns: undefined;
      };
      claim_events: {
        Args: { p_limit: number; p_now: string; p_until: string };
        Returns: {
          actor_user_id: string | null;
          attempts: number;
          dedupe_key: string | null;
          dispatched_at: string | null;
          failed_at: string | null;
          id: string;
          last_error: string | null;
          locked_until: string | null;
          next_attempt_at: string;
          occurred_at: string;
          payload: Json;
          type: string;
          workspace_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'events';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      connected_tools: {
        Args: never;
        Returns: {
          tool: string;
          workspace_id: string;
        }[];
      };
      contract_document_content: {
        Args: { p_id: string; p_workspace_id: string };
        Returns: string;
      };
      create_owner: {
        Args: { p_user: Json; p_workspace: Json };
        Returns: boolean;
      };
      delete_workspace: { Args: { p_workspace_id: string }; Returns: boolean };
      file_meeting_note: {
        Args: {
          p_client_id: string;
          p_id: string;
          p_source: Json;
          p_workspace_id: string;
        };
        Returns: {
          added_by: string | null;
          added_by_name: string;
          attendees: string[];
          body: string;
          client_id: string | null;
          created_at: string;
          id: string;
          occurred_on: string;
          title: string;
          via: string;
          workspace_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'meeting_notes';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      find_invite: {
        Args: { p_token_hash: string };
        Returns: {
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          invited_by_name: string;
          role: string;
          token_hash: string;
          workspace_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'invites';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      find_session: {
        Args: { p_token_hash: string };
        Returns: {
          created_at: string;
          expires_at: string;
          last_seen_at: string;
          token_hash: string;
          user_id: string;
          workspace_id: string;
          workspace_suspended: boolean;
        }[];
      };
      notes_inbox_workspace: { Args: { p_token: string }; Returns: string };
      platform_people: {
        Args: {
          p_limit?: number;
          p_query?: string;
          p_user_id?: string;
          p_workspace_id?: string;
        };
        Returns: {
          created_at: string;
          email: string;
          id: string;
          last_seen_at: string;
          name: string;
          role: string;
          sessions: number;
          title: string;
          two_factor: boolean;
          workspace_id: string;
          workspace_name: string;
        }[];
      };
      platform_workspaces: {
        Args: {
          p_id?: string;
          p_limit?: number;
          p_offset?: number;
          p_query?: string;
          p_status?: string;
        };
        Returns: {
          clients: number;
          connectors: number;
          created_at: string;
          failing_connectors: number;
          id: string;
          last_active_at: string;
          members: number;
          name: string;
          owner_email: string;
          owner_name: string;
          suspended_at: string;
          suspended_reason: string;
          time_zone: string;
          total: number;
        }[];
      };
      prune_meeting_points: {
        Args: { p_before: string; p_now: string; p_workspace_id: string };
        Returns: undefined;
      };
      remove_member: {
        Args: { p_user_id: string; p_workspace_id: string };
        Returns: boolean;
      };
      remove_tool: {
        Args: { p_tool: string; p_workspace_id: string };
        Returns: undefined;
      };
      replace_client_recipients: {
        Args: { p_client_id: string; p_rows: Json; p_workspace_id: string };
        Returns: undefined;
      };
      replace_patterns: {
        Args: { p_patterns: Json; p_workspace_id: string };
        Returns: undefined;
      };
      replace_recommendation_drafts: {
        Args: { p_client_id: string; p_rows: Json; p_workspace_id: string };
        Returns: undefined;
      };
      replace_tool_records: {
        Args: { p_records: Json; p_tool: string; p_workspace_id: string };
        Returns: undefined;
      };
      save_meeting_points: {
        Args: {
          p_client_id: string;
          p_excerpts: Json;
          p_points: Json;
          p_workspace_id: string;
        };
        Returns: undefined;
      };
      scheduled_report_workspaces: { Args: never; Returns: string[] };
      sync_clients: {
        Args: {
          p_clients: Json;
          p_links: Json;
          p_tool: string;
          p_workspace_id: string;
        };
        Returns: undefined;
      };
      upsert_tool_records: {
        Args: { p_records: Json; p_tool: string; p_workspace_id: string };
        Returns: undefined;
      };
      use_mfa_step: {
        Args: { p_step: number; p_user_id: string };
        Returns: boolean;
      };
      use_recovery_code: {
        Args: { p_hash: string; p_user_id: string };
        Returns: boolean;
      };
      use_staff_recovery_code: {
        Args: { p_hash: string; p_staff_id: string };
        Returns: boolean;
      };
      use_staff_step: {
        Args: { p_staff_id: string; p_step: number };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
