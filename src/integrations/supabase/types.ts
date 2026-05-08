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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          performed_by: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          performed_by?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          performed_by?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "admin_user_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_images: {
        Row: {
          added_at: string
          collection_id: string
          id: string
          image_id: string
        }
        Insert: {
          added_at?: string
          collection_id: string
          id?: string
          image_id: string
        }
        Update: {
          added_at?: string
          collection_id?: string
          id?: string
          image_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_images_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_images_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "generated_images"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      generated_images: {
        Row: {
          actual_height_px: number | null
          actual_width_px: number | null
          admin_status: Database["public"]["Enums"]["asset_admin_status"] | null
          aspect_ratio: string
          base_height_px: number | null
          base_width_px: number | null
          created_at: string
          crop_mode: string | null
          deleted_at: string | null
          enhanced: boolean | null
          enhanced_height_px: number | null
          enhanced_storage_path: string | null
          enhanced_width_px: number | null
          enhancement_model: string | null
          execution_route: string | null
          export_height: number | null
          export_preferred_asset: string | null
          export_ready: boolean | null
          export_storage_path: string | null
          export_type: string | null
          export_width: number | null
          fallback_used: boolean | null
          generation_mode: string | null
          generation_model: string | null
          generation_provider: string | null
          id: string
          master_storage_path: string | null
          mode: string
          original_storage_path: string | null
          padding_mode: string | null
          print_format_id: string | null
          print_size: string | null
          prompt: string
          provider_strategy: string | null
          quality_mode: string | null
          source_height: number | null
          source_width: number | null
          storage_path: string
          target_height_px: number | null
          target_ppi: number | null
          target_width_px: number | null
          upscale_applied: boolean | null
          upscale_factor: number | null
          upscale_method: string | null
          upscale_mode: string | null
          upscaled_at: string | null
        }
        Insert: {
          actual_height_px?: number | null
          actual_width_px?: number | null
          admin_status?:
            | Database["public"]["Enums"]["asset_admin_status"]
            | null
          aspect_ratio?: string
          base_height_px?: number | null
          base_width_px?: number | null
          created_at?: string
          crop_mode?: string | null
          deleted_at?: string | null
          enhanced?: boolean | null
          enhanced_height_px?: number | null
          enhanced_storage_path?: string | null
          enhanced_width_px?: number | null
          enhancement_model?: string | null
          execution_route?: string | null
          export_height?: number | null
          export_preferred_asset?: string | null
          export_ready?: boolean | null
          export_storage_path?: string | null
          export_type?: string | null
          export_width?: number | null
          fallback_used?: boolean | null
          generation_mode?: string | null
          generation_model?: string | null
          generation_provider?: string | null
          id?: string
          master_storage_path?: string | null
          mode?: string
          original_storage_path?: string | null
          padding_mode?: string | null
          print_format_id?: string | null
          print_size?: string | null
          prompt: string
          provider_strategy?: string | null
          quality_mode?: string | null
          source_height?: number | null
          source_width?: number | null
          storage_path: string
          target_height_px?: number | null
          target_ppi?: number | null
          target_width_px?: number | null
          upscale_applied?: boolean | null
          upscale_factor?: number | null
          upscale_method?: string | null
          upscale_mode?: string | null
          upscaled_at?: string | null
        }
        Update: {
          actual_height_px?: number | null
          actual_width_px?: number | null
          admin_status?:
            | Database["public"]["Enums"]["asset_admin_status"]
            | null
          aspect_ratio?: string
          base_height_px?: number | null
          base_width_px?: number | null
          created_at?: string
          crop_mode?: string | null
          deleted_at?: string | null
          enhanced?: boolean | null
          enhanced_height_px?: number | null
          enhanced_storage_path?: string | null
          enhanced_width_px?: number | null
          enhancement_model?: string | null
          execution_route?: string | null
          export_height?: number | null
          export_preferred_asset?: string | null
          export_ready?: boolean | null
          export_storage_path?: string | null
          export_type?: string | null
          export_width?: number | null
          fallback_used?: boolean | null
          generation_mode?: string | null
          generation_model?: string | null
          generation_provider?: string | null
          id?: string
          master_storage_path?: string | null
          mode?: string
          original_storage_path?: string | null
          padding_mode?: string | null
          print_format_id?: string | null
          print_size?: string | null
          prompt?: string
          provider_strategy?: string | null
          quality_mode?: string | null
          source_height?: number | null
          source_width?: number | null
          storage_path?: string
          target_height_px?: number | null
          target_ppi?: number | null
          target_width_px?: number | null
          upscale_applied?: boolean | null
          upscale_factor?: number | null
          upscale_method?: string | null
          upscale_mode?: string | null
          upscaled_at?: string | null
        }
        Relationships: []
      }
      generation_job_items: {
        Row: {
          created_at: string
          error_message: string | null
          gallery_image_id: string | null
          id: string
          image_url: string | null
          job_id: string
          prompt_variant: string
          seed: number | null
          status: string
          storage_path: string | null
          style: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          gallery_image_id?: string | null
          id?: string
          image_url?: string | null
          job_id: string
          prompt_variant: string
          seed?: number | null
          status?: string
          storage_path?: string | null
          style?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          gallery_image_id?: string | null
          id?: string
          image_url?: string | null
          job_id?: string
          prompt_variant?: string
          seed?: number | null
          status?: string
          storage_path?: string | null
          style?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_job_items_gallery_image_id_fkey"
            columns: ["gallery_image_id"]
            isOneToOne: false
            referencedRelation: "generated_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_jobs: {
        Row: {
          aspect_ratio: string
          background_style: string
          batch_size: number
          completed_images: number
          created_at: string
          failed_images: number
          hd_enhance: boolean
          id: string
          job_type: string
          matrix_variables: Json | null
          mode: string
          print_size: string | null
          prompt: string
          speed_mode: string
          status: string
          style_grid_styles: string[] | null
          target_height_px: number | null
          target_ppi: number | null
          target_width_px: number | null
          total_images: number
          updated_at: string
          white_frame: boolean
        }
        Insert: {
          aspect_ratio?: string
          background_style?: string
          batch_size?: number
          completed_images?: number
          created_at?: string
          failed_images?: number
          hd_enhance?: boolean
          id?: string
          job_type?: string
          matrix_variables?: Json | null
          mode?: string
          print_size?: string | null
          prompt: string
          speed_mode?: string
          status?: string
          style_grid_styles?: string[] | null
          target_height_px?: number | null
          target_ppi?: number | null
          target_width_px?: number | null
          total_images?: number
          updated_at?: string
          white_frame?: boolean
        }
        Update: {
          aspect_ratio?: string
          background_style?: string
          batch_size?: number
          completed_images?: number
          created_at?: string
          failed_images?: number
          hd_enhance?: boolean
          id?: string
          job_type?: string
          matrix_variables?: Json | null
          mode?: string
          print_size?: string | null
          prompt?: string
          speed_mode?: string
          status?: string
          style_grid_styles?: string[] | null
          target_height_px?: number | null
          target_ppi?: number | null
          target_width_px?: number | null
          total_images?: number
          updated_at?: string
          white_frame?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          created_at: string
          created_by: string | null
          display_name: string | null
          email: string
          id: string
          is_protected: boolean
          last_login_at: string | null
          notes: string | null
          provider: Database["public"]["Enums"]["auth_provider"]
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
          username: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email: string
          id?: string
          is_protected?: boolean
          last_login_at?: string | null
          notes?: string | null
          provider?: Database["public"]["Enums"]["auth_provider"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          email?: string
          id?: string
          is_protected?: boolean
          last_login_at?: string | null
          notes?: string | null
          provider?: Database["public"]["Enums"]["auth_provider"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_user_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      upscale_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          image_id: string | null
          mode: string
          output_url: string | null
          pipeline: Json | null
          recipe_id: string | null
          recipe_label: string | null
          recipe_reason: string | null
          replicate_prediction_id: string | null
          source_url: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          image_id?: string | null
          mode: string
          output_url?: string | null
          pipeline?: Json | null
          recipe_id?: string | null
          recipe_label?: string | null
          recipe_reason?: string | null
          replicate_prediction_id?: string | null
          source_url: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          image_id?: string | null
          mode?: string
          output_url?: string | null
          pipeline?: Json | null
          recipe_id?: string | null
          recipe_label?: string | null
          recipe_reason?: string | null
          replicate_prediction_id?: string | null
          source_url?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "upscale_jobs_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "generated_images"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_user_overview: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          created_by: string | null
          display_name: string | null
          email: string | null
          id: string | null
          is_protected: boolean | null
          last_login_at: string | null
          notes: string | null
          provider: Database["public"]["Enums"]["auth_provider"] | null
          roles: string[] | null
          status: Database["public"]["Enums"]["profile_status"] | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          is_protected?: boolean | null
          last_login_at?: string | null
          notes?: string | null
          provider?: Database["public"]["Enums"]["auth_provider"] | null
          roles?: never
          status?: Database["public"]["Enums"]["profile_status"] | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          display_name?: string | null
          email?: string | null
          id?: string | null
          is_protected?: boolean | null
          last_login_at?: string | null
          notes?: string | null
          provider?: Database["public"]["Enums"]["auth_provider"] | null
          roles?: never
          status?: Database["public"]["Enums"]["profile_status"] | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_user_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      cleanup_old_deleted_images: { Args: never; Returns: undefined }
      current_profile_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_profile_id: string
        }
        Returns: boolean
      }
      is_current_user_active: { Args: never; Returns: boolean }
      is_current_user_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      asset_admin_status:
        | "draft"
        | "needs_review"
        | "approved"
        | "rejected"
        | "archived"
      auth_provider: "password" | "google" | "mixed"
      profile_status: "active" | "disabled" | "pending"
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
    Enums: {
      app_role: ["admin", "user"],
      asset_admin_status: [
        "draft",
        "needs_review",
        "approved",
        "rejected",
        "archived",
      ],
      auth_provider: ["password", "google", "mixed"],
      profile_status: ["active", "disabled", "pending"],
    },
  },
} as const
