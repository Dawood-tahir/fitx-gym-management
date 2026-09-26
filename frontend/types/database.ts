export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row & Record<string, unknown>;
  Insert: Insert & Record<string, unknown>;
  Update: Update & Record<string, unknown>;
  Relationships: [];
};

export interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: "owner" | "admin" | "manager" | "receptionist";
  phone: string | null;
  avatar_path: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberRow {
  id: string;
  member_code: string;
  full_name: string;
  phone: string;
  email: string | null;
  national_id: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  join_date: string;
  status: "active" | "inactive" | "suspended" | "archived";
  notes: string | null;
  profile_photo_path: string | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipPlanRow {
  id: string;
  name: string;
  description: string | null;
  duration_months: number;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionRow {
  id: string;
  member_id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  amount: number;
  discount: number;
  final_amount: number;
  status: "active" | "cancelled" | "pending";
  is_current: boolean;
  notes: string | null;
  created_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethodRow {
  id: string;
  name: string;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  payment_number: string;
  member_id: string;
  subscription_id: string | null;
  amount: number;
  payment_method_id: string;
  payment_date: string;
  payment_type: "membership" | "renewal" | "registration" | "other";
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  is_voided: boolean;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExpenseRow {
  id: string;
  expense_number: string;
  title: string;
  category_id: string;
  description: string | null;
  amount: number;
  expense_date: string;
  payment_method_id: string;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffRow {
  id: string;
  profile_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  position: string;
  salary: number | null;
  hire_date: string;
  status: "active" | "inactive";
  address: string | null;
  notes: string | null;
  photo_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentRow {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  condition: "excellent" | "good" | "fair" | "poor";
  status: "active" | "maintenance" | "damaged" | "retired";
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplaintRow {
  id: string;
  member_id: string | null;
  name: string | null;
  phone: string | null;
  type: "complaint" | "suggestion" | "feedback";
  subject: string;
  message: string;
  status: "new" | "reviewing" | "resolved" | "closed";
  priority: "low" | "medium" | "high";
  admin_response: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GymSettingsRow {
  id: string;
  singleton: boolean;
  gym_name: string;
  logo_path: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string;
  timezone: string;
  default_locale: "en" | "ur";
  membership_expiry_warning_days: number;
  high_expense_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Json;
  created_at: string;
}

export interface ReminderSettingsRow {
  id: string;
  enabled: boolean;
  reminder_days: number[];
  channels: string[];
  english_template: string;
  urdu_template: string;
  created_at: string;
  updated_at: string;
}

export interface MemberOverviewRow extends MemberRow {
  subscription_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  start_date: string | null;
  end_date: string | null;
  membership_amount: number | null;
  discount: number | null;
  final_amount: number | null;
  amount_paid: number | null;
  balance: number | null;
  subscription_status: string | null;
  membership_status: string;
  payment_status: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow, {
        id: string; full_name: string; email: string; role?: ProfileRow["role"]; phone?: string | null;
        avatar_path?: string | null; is_active?: boolean; last_login_at?: string | null;
      }>;
      members: Table<MemberRow, Partial<MemberRow> & Pick<MemberRow, "full_name" | "phone" | "join_date">>;
      membership_plans: Table<MembershipPlanRow, Partial<MembershipPlanRow> & Pick<MembershipPlanRow, "name" | "duration_months" | "price">>;
      member_subscriptions: Table<SubscriptionRow, Partial<SubscriptionRow> & Pick<SubscriptionRow, "member_id" | "plan_id" | "start_date" | "end_date" | "amount" | "final_amount">>;
      payment_methods: Table<PaymentMethodRow, Partial<PaymentMethodRow> & Pick<PaymentMethodRow, "name">>;
      payments: Table<PaymentRow, Partial<PaymentRow> & Pick<PaymentRow, "member_id" | "amount" | "payment_method_id" | "payment_date">>;
      expense_categories: Table<ExpenseCategoryRow, Partial<ExpenseCategoryRow> & Pick<ExpenseCategoryRow, "name">>;
      expenses: Table<ExpenseRow, Partial<ExpenseRow> & Pick<ExpenseRow, "title" | "category_id" | "amount" | "expense_date" | "payment_method_id">>;
      staff: Table<StaffRow, Partial<StaffRow> & Pick<StaffRow, "full_name" | "phone" | "position" | "hire_date">>;
      equipment: Table<EquipmentRow, Partial<EquipmentRow> & Pick<EquipmentRow, "name">>;
      complaints_feedback: Table<ComplaintRow, Partial<ComplaintRow> & Pick<ComplaintRow, "type" | "subject" | "message" | "priority">>;
      gym_settings: Table<GymSettingsRow, Partial<GymSettingsRow>>;
      notifications: Table<NotificationRow, Partial<NotificationRow> & Pick<NotificationRow, "user_id" | "kind" | "title" | "message">>;
      audit_logs: Table<AuditLogRow, Partial<AuditLogRow> & Pick<AuditLogRow, "action" | "entity_type">>;
      reminder_settings: Table<ReminderSettingsRow, Partial<ReminderSettingsRow>>;
    };
    Views: {
      member_overview: {
        Row: MemberOverviewRow & Record<string, unknown>;
        Relationships: [];
      };
    };
    Functions: {
      create_member_with_membership: {
        Args: {
          p_full_name: string;
          p_phone: string;
          p_email?: string | null;
          p_national_id?: string | null;
          p_gender?: string | null;
          p_date_of_birth?: string | null;
          p_address?: string | null;
          p_emergency_contact_name?: string | null;
          p_emergency_contact_phone?: string | null;
          p_join_date: string;
          p_notes?: string | null;
          p_profile_photo_path?: string | null;
          p_plan_id: string;
          p_start_date: string;
          p_amount: number;
          p_discount?: number;
          p_amount_paid?: number;
          p_payment_method_id?: string | null;
        };
        Returns: string;
      };
      renew_membership: {
        Args: {
          p_member_id: string;
          p_plan_id: string;
          p_renewal_date: string;
          p_amount: number;
          p_discount?: number;
          p_amount_paid?: number;
          p_payment_method_id?: string | null;
          p_reference_number?: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      record_payment: {
        Args: {
          p_member_id: string;
          p_subscription_id?: string | null;
          p_amount: number;
          p_payment_method_id: string;
          p_payment_date: string;
          p_payment_type?: string;
          p_reference_number?: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      void_payment: {
        Args: { p_payment_id: string; p_reason: string };
        Returns: undefined;
      };
      resolve_complaint: {
        Args: { p_complaint_id: string; p_response: string };
        Returns: undefined;
      };
      dashboard_summary: { Args: { p_months?: number }; Returns: Json };
      member_timeline: { Args: { p_member_id: string }; Returns: Array<{ event_at: string; event_type: string; title: string; detail: string | null; amount: number | null; subscription_id: string | null; payment_id: string | null; }> };
      report_summary: { Args: { p_from: string; p_to: string }; Returns: Json };
      current_user_role: { Args: Record<string, never>; Returns: string | null };
      is_authorized_user: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
