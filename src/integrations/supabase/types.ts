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
          aspect_ratio: string
          created_at: string
          deleted_at: string | null
          id: string
          mode: string
          print_size: string | null
          prompt: string
          storage_path: string
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          mode?: string
          print_size?: string | null
          prompt: string
          storage_path: string
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          mode?: string
          print_size?: string | null
          prompt?: string
          storage_path?: string
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
          total_images?: number
          updated_at?: string
          white_frame?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_deleted_images: { Args: never; Returns: undefined }
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
