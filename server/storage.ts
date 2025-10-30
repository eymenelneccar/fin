import {
  users,
  customers,
  incomeEntries,
  expenseEntries,
  employees,
  activities,
  receivables,
  type User,
  type UpsertUser,
  type Customer,
  type InsertCustomer,
  type IncomeEntry,
  type InsertIncomeEntry,
  type ExpenseEntry,
  type InsertExpenseEntry,
  type Employee,
  type InsertEmployee,
  type Activity,
  type InsertActivity,
  type InsertManualUser,
  type Receivable,
  type InsertReceivable,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Manual user operations
  getAllUsers(): Promise<User[]>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createManualUser(user: InsertManualUser): Promise<User>;

  // Customer operations
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, data: Partial<Customer>): Promise<Customer>;
  deleteCustomer(id: string): Promise<void>;
  getExpiringCustomers(days: number): Promise<Customer[]>;

  // Income operations
  getIncomeEntries(startDate?: Date, endDate?: Date): Promise<IncomeEntry[]>;
  getIncomeEntry(id: string): Promise<IncomeEntry | undefined>;
  createIncomeEntry(entry: InsertIncomeEntry): Promise<IncomeEntry>;
  updateIncomeEntry(id: string, data: Partial<InsertIncomeEntry>): Promise<IncomeEntry | null>;
  deleteIncomeEntry(id: string): Promise<void>;
  getPrintIncomeEntries(): Promise<IncomeEntry[]>;

  // Expense operations
  getExpenseEntries(startDate?: Date, endDate?: Date): Promise<ExpenseEntry[]>;
  getExpenseEntry(id: string): Promise<ExpenseEntry | undefined>;
  createExpenseEntry(entry: InsertExpenseEntry): Promise<ExpenseEntry>;
  updateExpenseEntry(id: string, data: Partial<InsertExpenseEntry>): Promise<ExpenseEntry | null>;
  deleteExpenseEntry(id: string): Promise<void>;
  

  // Employee operations
  getEmployees(): Promise<Employee[]>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: string, data: Partial<Employee>): Promise<Employee>;
  deleteEmployee(id: string): Promise<void>;

  // Activity operations
  getRecentActivities(limit?: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;

  // Receivables operations
  getReceivables(): Promise<Receivable[]>;
  getReceivable(id: string): Promise<Receivable | undefined>;
  createReceivable(receivable: InsertReceivable): Promise<Receivable>;
  markReceivableAsPaid(id: string): Promise<Receivable>;
  deleteReceivable(id: string): Promise<void>;

  // Dashboard statistics
  getDashboardStats(): Promise<{
    totalCustomers: number;
    monthlyIncome: number;
    expiredSubscriptions: number;
    currentInventory: number;
    totalSalaries: number;
    financialStatus: 'healthy' | 'warning' | 'critical';
  }>;

  // User profile operations
  updateUserProfile(userId: string, updates: any): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Manual user operations
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createManualUser(userData: InsertManualUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        isManualUser: true,
      })
      .returning();

    // Log activity
    await this.createActivity({
      type: 'user_created',
      description: `تم إنشاء حساب مستخدم جديد: ${userData.username}`,
      relatedId: user.id,
    });

    return user;
  }

  // Customer operations
  async getCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).orderBy(desc(customers.createdAt));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(customerData: InsertCustomer): Promise<Customer> {
    // Calculate expiry date based on subscription type
    const joinDate = new Date(customerData.joinDate);
    let expiryDate = new Date(joinDate);

    switch (customerData.subscriptionType) {
      case 'annual':
        expiryDate.setFullYear(joinDate.getFullYear() + 1);
        break;
      case 'semi-annual':
        expiryDate.setMonth(joinDate.getMonth() + 6);
        break;
      case 'quarterly':
        expiryDate.setMonth(joinDate.getMonth() + 3);
        break;
    }

    const [customer] = await db
      .insert(customers)
      .values({
        ...customerData,
        expiryDate: expiryDate.toISOString().split('T')[0],
      })
      .returning();

    // Log activity
    await this.createActivity({
      type: 'customer_added',
      description: `تم إضافة عميل جديد: ${customer.name}`,
      relatedId: customer.id,
    });

    return customer;
  }

  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    const [customer] = await db
      .update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return customer;
  }

  async deleteCustomer(id: string): Promise<void> {
    await db.delete(customers).where(eq(customers.id, id));
  }

  async getExpiringCustomers(days: number): Promise<Customer[]> {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);

    return await db
      .select()
      .from(customers)
      .where(
        sql`${customers.expiryDate} <= ${targetDate.toISOString().split('T')[0]} AND ${customers.isActive} = true`
      );
  }

  // Income operations
  async getIncomeEntries(startDate?: Date, endDate?: Date): Promise<IncomeEntry[]> {
    if (startDate && endDate) {
      return await db
        .select()
        .from(incomeEntries)
        .where(
          sql`${incomeEntries.createdAt} >= ${startDate} AND ${incomeEntries.createdAt} <= ${endDate}`
        )
        .orderBy(desc(incomeEntries.createdAt));
    }

    return await db
      .select()
      .from(incomeEntries)
      .orderBy(desc(incomeEntries.createdAt));
  }

  async createIncomeEntry(entryData: InsertIncomeEntry): Promise<IncomeEntry> {
    const [entry] = await db
      .insert(incomeEntries)
      .values(entryData)
      .returning();

    // Log activity
    await this.createActivity({
      type: 'income_added',
      description: `تم تسجيل دخل بقيمة ${entryData.amount} د.ع`,
      relatedId: entry.id,
    });

    return entry;
  }

  async getPrintIncomeEntries(): Promise<any[]> {
    const prints = await db
      .select({
        id: incomeEntries.id,
        type: incomeEntries.type,
        printType: incomeEntries.printType,
        amount: incomeEntries.amount,
        isDownPayment: incomeEntries.isDownPayment,
        totalAmount: incomeEntries.totalAmount,
        receiptUrl: incomeEntries.receiptUrl,
        description: incomeEntries.description,
        createdAt: incomeEntries.createdAt,
        customerId: incomeEntries.customerId,
        customerName: customers.name,
      })
      .from(incomeEntries)
      .leftJoin(customers, eq(incomeEntries.customerId, customers.id))
      .where(eq(incomeEntries.type, 'prints'))
      .orderBy(desc(incomeEntries.createdAt));
    
    return prints;
  }

  // Expense operations
  async getExpenseEntries(startDate?: Date, endDate?: Date): Promise<ExpenseEntry[]> {
    if (startDate && endDate) {
      return await db
        .select()
        .from(expenseEntries)
        .where(
          sql`${expenseEntries.createdAt} >= ${startDate} AND ${expenseEntries.createdAt} <= ${endDate}`
        )
        .orderBy(desc(expenseEntries.createdAt));
    }

    return await db
      .select()
      .from(expenseEntries)
      .orderBy(desc(expenseEntries.createdAt));
  }

  async createExpenseEntry(entryData: InsertExpenseEntry): Promise<ExpenseEntry> {
    const [entry] = await db
      .insert(expenseEntries)
      .values(entryData)
      .returning();

    // Log activity
    await this.createActivity({
      type: 'expense_added',
      description: `تم تسجيل مصروف بقيمة ${entryData.amount} د.ع - ${entryData.reason}`,
      relatedId: entry.id,
    });

    return entry;
  }

  async getIncomeEntry(id: string): Promise<IncomeEntry | undefined> {
    const [entry] = await db.select().from(incomeEntries).where(eq(incomeEntries.id, id));
    return entry;
  }

  async updateIncomeEntry(id: string, data: Partial<InsertIncomeEntry>): Promise<IncomeEntry | null> {
    const [entry] = await db
      .update(incomeEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(incomeEntries.id, id))
      .returning();
    return entry || null;
  }

  async deleteIncomeEntry(id: string): Promise<void> {
    await db.delete(incomeEntries).where(eq(incomeEntries.id, id));
  }

  async getExpenseEntry(id: string): Promise<ExpenseEntry | undefined> {
    const [entry] = await db.select().from(expenseEntries).where(eq(expenseEntries.id, id));
    return entry;
  }

  async updateExpenseEntry(id: string, data: Partial<InsertExpenseEntry>): Promise<ExpenseEntry | null> {
    const [entry] = await db
      .update(expenseEntries)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(expenseEntries.id, id))
      .returning();
    return entry || null;
  }

  async deleteExpenseEntry(id: string): Promise<void> {
    await db.delete(expenseEntries).where(eq(expenseEntries.id, id));
  }

  // Employee operations
  async getEmployees(): Promise<Employee[]> {
    return await db
      .select()
      .from(employees)
      .where(eq(employees.isActive, true))
      .orderBy(desc(employees.createdAt));
  }

  async createEmployee(employeeData: InsertEmployee): Promise<Employee> {
    const [employee] = await db
      .insert(employees)
      .values(employeeData)
      .returning();

    // Log activity
    await this.createActivity({
      type: 'employee_added',
      description: `تم إضافة موظف جديد: ${employee.name}`,
      relatedId: employee.id,
    });

    return employee;
  }

  async updateEmployee(id: string, data: Partial<Employee>): Promise<Employee> {
    const [employee] = await db
      .update(employees)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();
    return employee;
  }

  async deleteEmployee(id: string): Promise<void> {
    await db
      .update(employees)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(employees.id, id));
  }

  // Activity operations
  async getRecentActivities(limit = 10): Promise<Activity[]> {
    return await db
      .select()
      .from(activities)
      .orderBy(desc(activities.createdAt))
      .limit(limit);
  }

  async createActivity(activityData: InsertActivity): Promise<Activity> {
    const [activity] = await db
      .insert(activities)
      .values(activityData)
      .returning();
    return activity;
  }

  // Receivables operations
  async getReceivables(): Promise<Receivable[]> {
    return await db
      .select()
      .from(receivables)
      .orderBy(desc(receivables.createdAt));
  }

  async getReceivable(id: string): Promise<Receivable | undefined> {
    const [receivable] = await db.select().from(receivables).where(eq(receivables.id, id));
    return receivable;
  }

  async createReceivable(receivableData: InsertReceivable): Promise<Receivable> {
    const [receivable] = await db
      .insert(receivables)
      .values(receivableData)
      .returning();

    // Log activity
    await this.createActivity({
      type: 'receivable_added',
      description: `تم تسجيل دين جديد للعميل ${receivableData.customerName} بقيمة ${receivableData.remainingAmount} د.ع`,
      relatedId: receivable.id,
    });

    return receivable;
  }

  async markReceivableAsPaid(id: string): Promise<Receivable> {
    const [receivable] = await db
      .update(receivables)
      .set({ isPaid: true, paidAt: new Date() })
      .where(eq(receivables.id, id))
      .returning();

    // Log activity
    await this.createActivity({
      type: 'receivable_paid',
      description: `تم تسديد الدين للعميل ${receivable.customerName}`,
      relatedId: receivable.id,
    });

    return receivable;
  }

  async deleteReceivable(id: string): Promise<void> {
    await db.delete(receivables).where(eq(receivables.id, id));
  }

  // Dashboard statistics
  async getDashboardStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Total customers
    const [{ count: totalCustomers }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(customers)
      .where(eq(customers.isActive, true));

    // Monthly income
    const monthlyIncomeResult = await db
      .select({ total: sql<number>`cast(coalesce(sum(cast(amount as decimal)), 0) as decimal)` })
      .from(incomeEntries)
      .where(sql`${incomeEntries.createdAt} >= ${startOfMonth} AND ${incomeEntries.createdAt} <= ${endOfMonth}`);
    const monthlyIncome = Number(monthlyIncomeResult[0]?.total || 0);

    // Expired subscriptions
    const today = new Date().toISOString().split('T')[0];
    const [{ count: expiredSubscriptions }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(customers)
      .where(sql`${customers.expiryDate} < ${today} AND ${customers.isActive} = true`);

    // Current inventory (total income - total expenses)
    const totalIncomeResult = await db
      .select({ total: sql<number>`cast(coalesce(sum(cast(amount as decimal)), 0) as decimal)` })
      .from(incomeEntries);
    const totalIncome = Number(totalIncomeResult[0]?.total || 0);

    const totalExpensesResult = await db
      .select({ total: sql<number>`cast(coalesce(sum(cast(amount as decimal)), 0) as decimal)` })
      .from(expenseEntries);
    const totalExpenses = Number(totalExpensesResult[0]?.total || 0);

    const currentInventory = totalIncome - totalExpenses;

    // Total salaries
    const totalSalariesResult = await db
      .select({ total: sql<number>`cast(coalesce(sum(cast(salary as decimal)), 0) as decimal)` })
      .from(employees)
      .where(eq(employees.isActive, true));
    const totalSalaries = Number(totalSalariesResult[0]?.total || 0);

    // Financial status
    let financialStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (currentInventory < totalSalaries) {
      financialStatus = 'critical';
    } else if (currentInventory < totalSalaries * 1.5) {
      financialStatus = 'warning';
    }

    return {
      totalCustomers,
      monthlyIncome,
      expiredSubscriptions,
      currentInventory,
      totalSalaries,
      financialStatus,
    };
  }

  async updateUserProfile(userId: string, updates: any): Promise<void> {
    // For Replit auth users, we'll store additional profile info in a separate table
    // For now, we'll just log the update since Replit auth handles the main user data
    console.log(`Updating profile for user ${userId}:`, updates);

    // In a real implementation, you would update the user data in your database
    // For this demo, we'll just acknowledge the update
    return Promise.resolve();
  }
}

// In-Memory storage for when database is unavailable
class MemoryStorage implements IStorage {
  private users: User[] = [];
  private customers: Customer[] = [];
  private incomeEntries: IncomeEntry[] = [];
  private expenseEntries: ExpenseEntry[] = [];
  private employees: Employee[] = [];
  private activities: Activity[] = [];
  private receivables: Receivable[] = [];

  constructor() {
    console.log("⚠️  Using in-memory storage - data will be lost on restart");
    
    // Create a default admin user with hashed password for "admin123"
    const defaultAdmin: User = {
      id: 'admin-user-id',
      username: 'admin',
      password: 'aacd577222cb7e3ede873ed2491b619ca18bde0e8cf2231f606923683ab540653d130d290ebbf01bc4740bdccded1cf7c952183b559ec3eaf5609711279766e5.3ec62ec2f28cb947c4a08138b983023f',
      firstName: 'مدير',
      lastName: 'النظام',
      email: 'admin@system.com',
      profileImageUrl: null,
      role: 'admin',
      isManualUser: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.users.push(defaultAdmin);
  }

  // Helper function to generate IDs
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.find(u => u.id === id);
  }

  async upsertUser(user: UpsertUser): Promise<User> {
    const existingIndex = this.users.findIndex(u => u.id === user.id);
    const newUser: User = { 
      ...user, 
      id: user.id || this.generateId(), 
      createdAt: new Date(), 
      updatedAt: new Date() 
    } as User;
    
    if (existingIndex >= 0) {
      this.users[existingIndex] = newUser;
    } else {
      this.users.push(newUser);
    }
    return newUser;
  }

  async getAllUsers(): Promise<User[]> {
    return [...this.users];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(u => u.username === username);
  }

  async createManualUser(userData: InsertManualUser): Promise<User> {
    const newUser: User = { 
      ...userData, 
      id: this.generateId(), 
      isManualUser: true, 
      createdAt: new Date(), 
      updatedAt: new Date() 
    } as User;
    
    this.users.push(newUser);
    
    // Log activity
    await this.createActivity({
      type: 'user_created',
      description: `تم إنشاء حساب مستخدم جديد: ${userData.username}`,
      relatedId: newUser.id,
    });
    
    return newUser;
  }

  async getCustomers(): Promise<Customer[]> {
    return [...this.customers].sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    return this.customers.find(c => c.id === id);
  }

  async createCustomer(customerData: InsertCustomer): Promise<Customer> {
    // Calculate expiry date based on subscription type
    const joinDate = new Date(customerData.joinDate);
    let expiryDate = new Date(joinDate);

    switch (customerData.subscriptionType) {
      case 'annual':
        expiryDate.setFullYear(joinDate.getFullYear() + 1);
        break;
      case 'semi-annual':
        expiryDate.setMonth(joinDate.getMonth() + 6);
        break;
      case 'quarterly':
        expiryDate.setMonth(joinDate.getMonth() + 3);
        break;
    }

    const customer: Customer = {
      ...customerData,
      id: this.generateId(),
      expiryDate: expiryDate.toISOString().split('T')[0],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Customer;
    
    this.customers.push(customer);
    
    // Log activity
    await this.createActivity({
      type: 'customer_added',
      description: `تم إضافة عميل جديد: ${customer.name}`,
      relatedId: customer.id,
    });
    
    return customer;
  }

  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    const index = this.customers.findIndex(c => c.id === id);
    if (index >= 0) {
      this.customers[index] = { ...this.customers[index], ...data, updatedAt: new Date() };
      return this.customers[index];
    }
    throw new Error('Customer not found');
  }

  async deleteCustomer(id: string): Promise<void> {
    const index = this.customers.findIndex(c => c.id === id);
    if (index >= 0) {
      this.customers.splice(index, 1);
    }
  }

  async getExpiringCustomers(days: number): Promise<Customer[]> {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    return this.customers.filter(c => 
      c.isActive && new Date(c.expiryDate) <= targetDate
    );
  }

  async getIncomeEntries(startDate?: Date, endDate?: Date): Promise<IncomeEntry[]> {
    let filtered = [...this.incomeEntries];
    if (startDate && endDate) {
      filtered = filtered.filter(entry => 
        entry.createdAt && entry.createdAt >= startDate && entry.createdAt <= endDate
      );
    }
    return filtered.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async createIncomeEntry(entryData: InsertIncomeEntry): Promise<IncomeEntry> {
    const entry: IncomeEntry = {
      ...entryData,
      id: this.generateId(),
      createdAt: new Date()
    } as IncomeEntry;
    
    this.incomeEntries.push(entry);
    
    // Log activity
    await this.createActivity({
      type: 'income_added',
      description: `تم تسجيل دخل بقيمة ${entryData.amount} د.ع`,
      relatedId: entry.id,
    });
    
    return entry;
  }

  async getPrintIncomeEntries(): Promise<IncomeEntry[]> {
    return this.incomeEntries.filter(entry => entry.type === 'prints')
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getExpenseEntries(startDate?: Date, endDate?: Date): Promise<ExpenseEntry[]> {
    let filtered = [...this.expenseEntries];
    if (startDate && endDate) {
      filtered = filtered.filter(entry => 
        entry.createdAt && entry.createdAt >= startDate && entry.createdAt <= endDate
      );
    }
    return filtered.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async createExpenseEntry(entryData: InsertExpenseEntry): Promise<ExpenseEntry> {
    const entry: ExpenseEntry = {
      ...entryData,
      id: this.generateId(),
      createdAt: new Date()
    } as ExpenseEntry;
    
    this.expenseEntries.push(entry);
    
    // Log activity
    await this.createActivity({
      type: 'expense_added',
      description: `تم تسجيل مصروف بقيمة ${entryData.amount} د.ع - ${entryData.reason}`,
      relatedId: entry.id,
    });
    
    return entry;
  }

  async getEmployees(): Promise<Employee[]> {
    return this.employees.filter(e => e.isActive)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async createEmployee(employeeData: InsertEmployee): Promise<Employee> {
    const employee: Employee = {
      ...employeeData,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date()
    } as Employee;
    
    this.employees.push(employee);
    
    // Log activity
    await this.createActivity({
      type: 'employee_added',
      description: `تم إضافة موظف جديد: ${employee.name}`,
      relatedId: employee.id,
    });
    
    return employee;
  }

  async updateEmployee(id: string, data: Partial<Employee>): Promise<Employee> {
    const index = this.employees.findIndex(e => e.id === id);
    if (index >= 0) {
      this.employees[index] = { ...this.employees[index], ...data, updatedAt: new Date() };
      return this.employees[index];
    }
    throw new Error('Employee not found');
  }

  async deleteEmployee(id: string): Promise<void> {
    const index = this.employees.findIndex(e => e.id === id);
    if (index >= 0) {
      this.employees[index] = { ...this.employees[index], isActive: false, updatedAt: new Date() };
    }
  }

  async getRecentActivities(limit = 10): Promise<Activity[]> {
    return this.activities
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
  }

  async createActivity(activityData: InsertActivity): Promise<Activity> {
    const activity: Activity = {
      ...activityData,
      id: this.generateId(),
      createdAt: new Date()
    } as Activity;
    
    this.activities.push(activity);
    return activity;
  }

  // Receivables operations
  async getReceivables(): Promise<Receivable[]> {
    return this.receivables
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getReceivable(id: string): Promise<Receivable | undefined> {
    return this.receivables.find(r => r.id === id);
  }

  async createReceivable(receivableData: InsertReceivable): Promise<Receivable> {
    const receivable: Receivable = {
      ...receivableData,
      id: this.generateId(),
      createdAt: new Date(),
      paidAt: null
    } as Receivable;
    
    this.receivables.push(receivable);
    
    // Log activity
    await this.createActivity({
      type: 'receivable_added',
      description: `تم تسجيل دين جديد للعميل ${receivableData.customerName} بقيمة ${receivableData.remainingAmount} د.ع`,
      relatedId: receivable.id,
    });
    
    return receivable;
  }

  async markReceivableAsPaid(id: string): Promise<Receivable> {
    const index = this.receivables.findIndex(r => r.id === id);
    if (index >= 0) {
      this.receivables[index] = { 
        ...this.receivables[index], 
        isPaid: true, 
        paidAt: new Date() 
      };
      
      // Log activity
      await this.createActivity({
        type: 'receivable_paid',
        description: `تم تسديد الدين للعميل ${this.receivables[index].customerName}`,
        relatedId: id,
      });
      
      return this.receivables[index];
    }
    throw new Error('Receivable not found');
  }

  async deleteReceivable(id: string): Promise<void> {
    const index = this.receivables.findIndex(r => r.id === id);
    if (index >= 0) {
      this.receivables.splice(index, 1);
    }
  }

  async getDashboardStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Calculate stats from in-memory data
    const totalCustomers = this.customers.filter(c => c.isActive !== false).length;
    
    const monthlyIncome = this.incomeEntries
      .filter(entry => entry.createdAt && entry.createdAt >= startOfMonth && entry.createdAt <= endOfMonth)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    const today = new Date().toISOString().split('T')[0];
    const expiredSubscriptions = this.customers.filter(c => 
      c.isActive && c.expiryDate < today
    ).length;

    const totalIncome = this.incomeEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const totalExpensesValue = this.expenseEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const currentInventory = totalIncome - totalExpensesValue;

    const totalSalaries = this.employees
      .filter(e => e.isActive)
      .reduce((sum, emp) => sum + Number(emp.salary || 0), 0);

    // Financial status
    let financialStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (currentInventory < totalSalaries) {
      financialStatus = 'critical';
    } else if (currentInventory < totalSalaries * 1.5) {
      financialStatus = 'warning';
    }

    return {
      totalCustomers,
      monthlyIncome,
      expiredSubscriptions,
      currentInventory,
      totalSalaries,
      financialStatus,
    };
  }

  async updateUserProfile(userId: string, updates: any): Promise<void> {
    const index = this.users.findIndex(u => u.id === userId);
    if (index >= 0) {
      this.users[index] = { ...this.users[index], ...updates, updatedAt: new Date() };
    }
  }
}

// Create storage instance - use database if available, otherwise fallback to memory
export const storage: IStorage = db ? new DatabaseStorage() : new MemoryStorage();