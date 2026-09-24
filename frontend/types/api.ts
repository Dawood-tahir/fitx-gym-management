export type UserRole = "OWNER" | "ADMIN" | "STAFF";

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: unknown;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  avatarUrl?: string;
  status?: "Active" | "Disabled";
  lastLoginAt?: string;
}

export interface AuthSession {
  user: User;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export type MembershipStatus = "Active" | "Expiring Soon" | "Expired" | "Inactive" | "Suspended" | "Cancelled" | "Pending";
export type PaymentStatus = "Paid" | "Partial" | "Unpaid" | "Voided";

export interface MembershipPlan {
  id: string;
  name: string;
  durationMonths: number;
  durationDays?: number;
  price: number;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface MembershipPlanInput {
  name: string;
  description?: string;
  durationMonths: number;
  price: number;
  isActive?: boolean;
}

export interface MembershipHistoryItem {
  id: string;
  plan: string;
  planId?: string;
  startDate: string;
  expiryDate: string;
  finalFee: number;
  amountPaid: number;
  balance: number;
  status: string;
  isCurrent: boolean;
}

export interface RenewalHistoryItem {
  id: string;
  previousPlan: string;
  newPlan: string;
  renewalDate: string;
  newExpiryDate: string;
  amountPaid: number;
}

export interface Member {
  id: string;
  memberId: string;
  fullName: string;
  phone: string;
  email?: string;
  cnic?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  profilePhotoPath?: string;
  profilePhotoUrl?: string;
  status?: "Active" | "Inactive" | "Suspended" | "Archived";
  planId?: string;
  planName: string;
  joinDate: string;
  startDate?: string;
  expiryDate: string;
  fee: number;
  discount?: number;
  finalFee?: number;
  amountPaid?: number;
  balance?: number;
  paymentStatus: PaymentStatus;
  membershipStatus: MembershipStatus;
  notes?: string;
  createdAt?: string;
  currentMembershipId?: string;
  membershipHistory?: MembershipHistoryItem[];
  paymentHistory?: Payment[];
  renewalHistory?: RenewalHistoryItem[];
}

export interface MemberInput {
  fullName: string;
  phone: string;
  email?: string;
  cnic?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  membershipPlanId: string;
  joiningDate: string;
  membershipStartDate: string;
  expiryDate?: string;
  membershipFee: number;
  discount: number;
  amountPaid: number;
  paymentMethodId?: string;
  notes?: string;
  profilePhoto?: File;
}

export interface RenewMembershipInput {
  planId: string;
  renewalDate: string;
  membershipFee: number;
  discount: number;
  amountPaid: number;
  paymentMethodId?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface Payment {
  id: string;
  paymentId?: string;
  receiptNumber?: string;
  date: string;
  memberId: string;
  memberName: string;
  subscriptionId?: string;
  planName?: string;
  amount: number;
  totalFee?: number;
  discount?: number;
  amountPaid: number;
  balance: number;
  method: string;
  methodId?: string;
  paymentType?: string;
  status: PaymentStatus;
  referenceNumber?: string;
  notes?: string;
  receivedBy?: string;
  createdAt?: string;
}

export interface PaymentInput {
  memberId: string;
  membershipId?: string;
  totalFee: number;
  discount: number;
  amountPaid: number;
  paymentMethodId: string;
  paymentDate: string;
  paymentType?: "membership" | "renewal" | "registration" | "other";
  referenceNumber?: string;
  notes?: string;
}

export interface Expense {
  id: string;
  expenseNumber?: string;
  title?: string;
  date: string;
  categoryId?: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod?: string;
  paymentMethodId?: string;
  reference?: string;
  notes?: string;
  addedBy?: string;
  createdAt?: string;
}

export interface ExpenseInput {
  title?: string;
  categoryId: string;
  description: string;
  amount: number;
  date: string;
  paymentMethodId: string;
  reference?: string;
  notes?: string;
}

export interface Staff {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  position: string;
  salary?: number;
  hireDate: string;
  status: "Active" | "Inactive";
  address?: string;
  notes?: string;
  photoPath?: string;
  photoUrl?: string;
  profileId?: string;
  createdAt?: string;
}

export interface StaffInput {
  fullName: string;
  phone: string;
  email?: string;
  position: string;
  salary?: number;
  hireDate: string;
  status?: "Active" | "Inactive";
  address?: string;
  notes?: string;
  photo?: File;
}

export interface Equipment {
  id: string;
  name: string;
  category?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  condition: "Excellent" | "Good" | "Fair" | "Poor";
  status: "Active" | "Maintenance" | "Damaged" | "Retired";
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  notes?: string;
  createdAt?: string;
}

export type EquipmentInput = Omit<Equipment, "id" | "createdAt">;

export interface Complaint {
  id: string;
  memberId?: string;
  memberName?: string;
  name?: string;
  phone?: string;
  type: "Complaint" | "Suggestion" | "Feedback";
  subject: string;
  message: string;
  status: "New" | "Reviewing" | "Resolved" | "Closed";
  priority: "Low" | "Medium" | "High";
  adminResponse?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface ComplaintInput {
  memberId?: string;
  name?: string;
  phone?: string;
  type: "complaint" | "suggestion" | "feedback";
  subject: string;
  message: string;
  status?: "new" | "reviewing" | "resolved" | "closed";
  priority: "low" | "medium" | "high";
  adminResponse?: string;
}

export interface LookupItem {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface Reminder {
  id: string;
  memberId: string;
  memberName: string;
  type: "Membership Expiring" | "Membership Expired" | "Payment Due" | "Overdue Payment";
  dueDate: string;
  amount?: number;
  channel: "WhatsApp" | "SMS" | "Email";
  status: "Pending" | "Sent" | "Failed";
  language?: "en" | "ur";
  sentAt?: string;
}

export interface ReminderSettings {
  enabled: boolean;
  reminderDays: number[];
  channels: string[];
  englishTemplate: string;
  urduTemplate: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface TrendPoint {
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
  newMembers: number;
}

export interface DistributionPoint {
  name: string;
  value: number;
}

export interface DashboardData {
  totalMembers?: number;
  activeMembers: number;
  activeMembersChange: number;
  expiringSoon: number;
  expiringSoonChange: number;
  unpaidFees: number;
  unpaidFeesChange: number;
  monthlyRevenue: number;
  revenueToday?: number;
  revenueChange: number;
  monthlyExpenses: number;
  expensesChange: number;
  netProfit: number;
  profitChange: number;
  pendingComplaints?: number;
  equipmentMaintenance?: number;
  trend: TrendPoint[];
  membershipStatus: DistributionPoint[];
  paymentStatus: DistributionPoint[];
  planDistribution: DistributionPoint[];
  recentMembers: Member[];
  recentPayments: Payment[];
  recentExpenses: Expense[];
}

export interface ReportSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  outstandingAmount: number;
  newMembers: number;
  trend: TrendPoint[];
  byPlan?: DistributionPoint[];
  byExpenseCategory?: DistributionPoint[];
  byPaymentMethod?: DistributionPoint[];
}

export interface GymSettings {
  id?: string;
  gymName: string;
  phone: string;
  email: string;
  address: string;
  currency: string;
  timezone: string;
  locale: "en" | "ur";
  expiringSoonDays?: number;
  highExpenseThreshold?: number;
  logoPath?: string;
  logoUrl?: string;
  logo?: File;
}

export interface PaymentSummary {
  paymentsThisMonth: number;
  outstandingAmount: number;
  paidMembers: number;
  unpaidMembers: number;
}

export interface ExpenseSummary {
  totalThisMonth: number;
  largestCategory: string;
  changePercentFromLastMonth: number;
}
