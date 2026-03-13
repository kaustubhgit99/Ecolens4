export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole        = "citizen" | "authority" | "admin";
export type ComplaintStatus =
  | "pending"
  | "ai_processing"
  | "rejected_spam"
  | "merged"
  | "routed"
  | "in_progress"
  | "resolved";
export type AiPriority = "High" | "Medium" | "Low";
export type AiSeverity = "high" | "medium" | "low";
export type NotifType  = "status_update" | "coin_earned" | "duplicate_merged";

export interface UserRow {
  id:           string;
  email:        string | null;
  phone:        string | null;
  full_name:    string;
  role:         UserRole;
  ward:         string | null;
  department:   string | null;
  coins_total:  number;
  coins_month:  number;
  spam_strikes: number;
  is_blocked:   boolean;
  created_at:   string;
  updated_at:   string;
}

export interface ComplaintRow {
  id:                string;
  citizen_id:        string | null;
  title:             string | null;
  description:       string | null;
  voice_transcript:  string | null;
  image_url:         string | null;
  audio_url:         string | null;
  latitude:          number | null;
  longitude:         number | null;
  address:           string | null;
  ward:              string | null;
  ai_category:       string | null;
  ai_subcategory:    string | null;
  ai_priority:       AiPriority | null;
  ai_priority_score: number | null;
  ai_department:     string | null;
  ai_is_spam:        boolean;
  ai_is_duplicate:   boolean;
  ai_duplicate_of:   string | null;
  ai_severity:       AiSeverity | null;
  ai_confidence:     number | null;
  ai_objects:        Json;
  ai_raw_response:   Json | null;
  status:            ComplaintStatus;
  assigned_to:       string | null;
  department:        string | null;
  resolved_at:       string | null;
  resolution_notes:  string | null;
  coins_awarded:     boolean;
  created_at:        string;
  updated_at:        string;
}

export interface CoinTransactionRow {
  id:           string;
  user_id:      string;
  complaint_id: string | null;
  coins:        number;
  reason:       string;
  created_at:   string;
}

export interface DepartmentRow {
  id:           string;
  name:         string;
  code:         string;
  head_user_id: string | null;
  active:       boolean;
  created_at:   string;
}

export interface NotificationRow {
  id:           string;
  user_id:      string;
  complaint_id: string | null;
  message:      string;
  type:         NotifType;
  read:         boolean;
  created_at:   string;
}

export type UserInsert            = Omit<UserRow,             "created_at" | "updated_at">;
export type UserUpdate            = Partial<UserInsert>;
export type ComplaintInsert       = Omit<ComplaintRow,        "created_at" | "updated_at">;
export type ComplaintUpdate       = Partial<ComplaintInsert>;
export type CoinTransactionInsert = Omit<CoinTransactionRow,  "created_at">;
export type DepartmentInsert      = Omit<DepartmentRow,       "created_at">;
export type DepartmentUpdate      = Partial<DepartmentInsert>;
export type NotificationInsert    = Omit<NotificationRow,     "created_at">;
export type NotificationUpdate    = Partial<NotificationInsert>;

export interface Database {
  public: {
    Tables: {
      users: {
        Row:    UserRow;
        Insert: UserInsert;
        Update: UserUpdate;
      };
      complaints: {
        Row:    ComplaintRow;
        Insert: ComplaintInsert;
        Update: ComplaintUpdate;
      };
      coin_transactions: {
        Row:    CoinTransactionRow;
        Insert: CoinTransactionInsert;
        Update: never;
      };
      departments: {
        Row:    DepartmentRow;
        Insert: DepartmentInsert;
        Update: DepartmentUpdate;
      };
      notifications: {
        Row:    NotificationRow;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
      };
    };
    Views:     Record<string, never>;
    Functions: Record<string, never>;
    Enums:     Record<string, never>;
  };
}
