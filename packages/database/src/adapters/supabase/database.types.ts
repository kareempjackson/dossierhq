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
      attention_items: {
        Row: {
          client_id: string | null;
          id: string;
          kind: string;
          raised_at: string;
          source_ids: string[];
          title: string;
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
          at: string;
          client_id: string | null;
          id: string;
          read: string;
          record_count: number;
          tool: string;
          workspace_id: string;
        };
        Insert: {
          at: string;
          client_id?: string | null;
          id: string;
          read: string;
          record_count: number;
          tool: string;
          workspace_id: string;
        };
        Update: {
          at?: string;
          client_id?: string | null;
          id?: string;
          read?: string;
          record_count?: number;
          tool?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_entries_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_overview';
            referencedColumns: ['client_id'];
          },
          {
            foreignKeyName: 'audit_entries_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
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
          contact_name: string;
          contact_role: string;
          contract_currency: string;
          contract_includes: string[];
          contract_monthly_fee: number;
          contract_plan: string;
          contract_renews_on: string;
          contract_started_on: string;
          id: string;
          industry: string;
          location: string;
          name: string;
          seats: number;
          workspace_id: string;
        };
        Insert: {
          contact_name: string;
          contact_role: string;
          contract_currency: string;
          contract_includes?: string[];
          contract_monthly_fee: number;
          contract_plan: string;
          contract_renews_on: string;
          contract_started_on: string;
          id: string;
          industry: string;
          location: string;
          name: string;
          seats: number;
          workspace_id: string;
        };
        Update: {
          contact_name?: string;
          contact_role?: string;
          contract_currency?: string;
          contract_includes?: string[];
          contract_monthly_fee?: number;
          contract_plan?: string;
          contract_renews_on?: string;
          contract_started_on?: string;
          id?: string;
          industry?: string;
          location?: string;
          name?: string;
          seats?: number;
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
          failure: Json | null;
          id: string;
          last_sync_at: string;
          scope: string;
          status: string;
          tool: string;
          workspace_id: string;
        };
        Insert: {
          access: string;
          failure?: Json | null;
          id: string;
          last_sync_at: string;
          scope: string;
          status: string;
          tool: string;
          workspace_id: string;
        };
        Update: {
          access?: string;
          failure?: Json | null;
          id?: string;
          last_sync_at?: string;
          scope?: string;
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
      recommendations: {
        Row: {
          client_id: string;
          created_at: string;
          decided_at: string | null;
          id: string;
          reason: string;
          source_ids: string[];
          status: string;
          title: string;
          workspace_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          decided_at?: string | null;
          id: string;
          reason: string;
          source_ids: string[];
          status: string;
          title: string;
          workspace_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          reason?: string;
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
      reports: {
        Row: {
          approved_at: string | null;
          client_id: string;
          exceptions: string[];
          generated_at: string;
          glance: Json;
          id: string;
          sections: Json;
          status: string;
          title: string;
          week_end: string;
          week_start: string;
          workspace_id: string;
        };
        Insert: {
          approved_at?: string | null;
          client_id: string;
          exceptions?: string[];
          generated_at: string;
          glance?: Json;
          id: string;
          sections?: Json;
          status: string;
          title: string;
          week_end: string;
          week_start: string;
          workspace_id: string;
        };
        Update: {
          approved_at?: string | null;
          client_id?: string;
          exceptions?: string[];
          generated_at?: string;
          glance?: Json;
          id?: string;
          sections?: Json;
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
      sources: {
        Row: {
          client_id: string | null;
          fields: Json;
          id: string;
          kind: string;
          meeting_id: string | null;
          quote: string | null;
          record_id: string;
          record_type: string;
          recorded_at: string;
          speaker_name: string | null;
          speaker_role: string | null;
          title: string;
          tool: string;
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
          quote?: string | null;
          record_id: string;
          record_type: string;
          recorded_at: string;
          speaker_name?: string | null;
          speaker_role?: string | null;
          title: string;
          tool: string;
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
          quote?: string | null;
          record_id?: string;
          record_type?: string;
          recorded_at?: string;
          speaker_name?: string | null;
          speaker_role?: string | null;
          title?: string;
          tool?: string;
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
            foreignKeyName: 'sources_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          time_zone: string;
          user_name: string;
          user_role: string;
        };
        Insert: {
          id: string;
          name: string;
          time_zone: string;
          user_name: string;
          user_role: string;
        };
        Update: {
          id?: string;
          name?: string;
          time_zone?: string;
          user_name?: string;
          user_role?: string;
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
      [_ in never]: never;
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
