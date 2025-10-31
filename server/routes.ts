import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, hashPassword } from "./auth";
import {
  insertCustomerSchema,
  insertIncomeEntrySchema,
  insertExpenseEntrySchema,
  insertEmployeeSchema,
  insertManualUserSchema,
  insertReceivableSchema
} from "@shared/schema";




// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('يُسمح فقط بملفات الصور و PDF'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  setupAuth(app);

  // Session debugging middleware (after setupAuth)
  app.use((req, res, next) => {
    const sessionId = (req.session as any)?.id;
    const userId = (req.session as any)?.userId;
    
    if (req.path.startsWith('/api/') && req.path !== '/api/auth/login' && req.path !== '/api/auth/user') {
      console.log(`Session debug - Path: ${req.path}, SessionID: ${sessionId}, UserID: ${userId}`);
    }
    next();
  });

  // Update user profile
  app.put('/api/auth/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { firstName, lastName, email, username, password } = req.body;
      
      // Prepare update data
      const updateData: any = {};
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (email) updateData.email = email;
      if (username) updateData.username = username;
      
      // Hash password if provided
      if (password && password.trim() !== '') {
        const hashedPassword = await hashPassword(password);
        updateData.password = hashedPassword;
      }
      
      // Update user in storage
      await storage.updateUserProfile(userId, updateData);
      
      // Return updated user data
      const updatedUser = await storage.getUser(userId);
      const { password: _, ...safeUser } = updatedUser!;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "فشل في تحديث البروفايل" });
    }
  });

  // Dashboard stats
  app.get('/api/dashboard/stats', isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "فشل في جلب إحصائيات لوحة التحكم" });
    }
  });

  // Recent activities
  app.get('/api/activities', isAuthenticated, async (req, res) => {
    try {
      const activities = await storage.getRecentActivities(10);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "فشل في جلب الأنشطة الأخيرة" });
    }
  });

  // Customer routes
  app.get('/api/customers', isAuthenticated, async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      res.status(500).json({ message: "فشل في جلب العملاء" });
    }
  });

  app.post('/api/customers', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(validatedData);
      res.status(201).json(customer);
    } catch (error) {
      console.error("Error creating customer:", error);
      res.status(400).json({ message: "بيانات العميل غير صحيحة" });
    }
  });

  app.patch('/api/customers/:id/renew', isAuthenticated, async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ message: "العميل غير موجود" });
      }

      // Extend subscription by one year
      const currentExpiry = new Date(customer.expiryDate);
      const newExpiry = new Date(currentExpiry);
      newExpiry.setFullYear(currentExpiry.getFullYear() + 1);

      const updatedCustomer = await storage.updateCustomer(req.params.id, {
        expiryDate: newExpiry.toISOString().split('T')[0],
        isActive: true
      });

      // Log activity
      await storage.createActivity({
        type: 'subscription_renewed',
        description: `تم تجديد اشتراك العميل: ${customer.name}`,
        relatedId: customer.id,
      });

      res.json(updatedCustomer);
    } catch (error) {
      console.error("Error renewing subscription:", error);
      res.status(500).json({ message: "فشل في تجديد الاشتراك" });
    }
  });

  // Update customer
  app.put('/api/customers/:id', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await storage.updateCustomer(req.params.id, validatedData);
      
      if (!customer) {
        return res.status(404).json({ message: "العميل غير موجود" });
      }

      // Log activity
      await storage.createActivity({
        type: 'customer_updated',
        description: `تم تعديل بيانات العميل: ${customer.name}`,
        relatedId: customer.id,
      });

      res.json(customer);
    } catch (error) {
      console.error("Error updating customer:", error);
      res.status(400).json({ message: "فشل في تعديل العميل" });
    }
  });

  // Delete customer
  app.delete('/api/customers/:id', isAuthenticated, async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ message: "العميل غير موجود" });
      }

      await storage.deleteCustomer(req.params.id);
      
      // Log activity
      await storage.createActivity({
        type: 'customer_deleted',
        description: `تم حذف العميل: ${customer.name}`,
        relatedId: customer.id,
      });

      res.json({ message: "تم حذف العميل بنجاح" });
    } catch (error) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ message: "فشل في حذف العميل" });
    }
  });

  app.get('/api/customers/expiring/:days', isAuthenticated, async (req, res) => {
    try {
      const days = parseInt(req.params.days);
      const expiringCustomers = await storage.getExpiringCustomers(days);
      res.json(expiringCustomers);
    } catch (error) {
      console.error("Error fetching expiring customers:", error);
      res.status(500).json({ message: "فشل في جلب العملاء المنتهيين" });
    }
  });

  // Income routes
  app.get('/api/income', isAuthenticated, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const incomeEntries = await storage.getIncomeEntries(start, end);
      res.json(incomeEntries);
    } catch (error) {
      console.error("Error fetching income entries:", error);
      res.status(500).json({ message: "فشل في جلب الإدخالات" });
    }
  });

  app.post('/api/income', isAuthenticated, upload.single('receipt'), async (req, res) => {
    try {
      // Validate down payment requirements
      if (req.body.isDownPayment === 'true' || req.body.isDownPayment === true) {
        if (!req.body.totalAmount || Number(req.body.totalAmount) <= 0) {
          return res.status(400).json({ message: "المبلغ الكامل مطلوب عند اختيار العربون" });
        }
      }

      // Convert empty customerId to null and isDownPayment to boolean
      const cleanedBody = {
        ...req.body,
        customerId: req.body.customerId && req.body.customerId.trim() !== '' ? req.body.customerId : null,
        isDownPayment: req.body.isDownPayment === 'true' || req.body.isDownPayment === true,
        receiptUrl: req.file ? `/uploads/${req.file.filename}` : null
      };

      const validatedData = insertIncomeEntrySchema.parse(cleanedBody);
      
      const incomeEntry = await storage.createIncomeEntry(validatedData);
      
      // If this is a down payment, create a receivable for the remaining amount
      if (validatedData.isDownPayment && validatedData.totalAmount) {
        const totalAmount = Number(validatedData.totalAmount);
        const paidAmount = Number(validatedData.amount);
        const remainingAmount = totalAmount - paidAmount;

        if (remainingAmount > 0) {
          // Get customer name
          let customerName = "عميل غير محدد";
          const customerId = validatedData.customerId && validatedData.customerId.trim() !== '' ? validatedData.customerId : null;
          
          if (customerId) {
            const customer = await storage.getCustomer(customerId);
            if (customer) {
              customerName = customer.name;
            }
          }

          await storage.createReceivable({
            incomeEntryId: incomeEntry.id,
            customerId,
            customerName,
            totalAmount: validatedData.totalAmount,
            paidAmount: validatedData.amount,
            remainingAmount: remainingAmount.toString(),
            isPaid: false,
            description: validatedData.description || ""
          });
        }
      }
      
      // Log activity
      await storage.createActivity({
        type: 'income_added',
        description: `تم تسجيل إدخال ${validatedData.type === 'prints' ? 'مطبوعات' : 'اشتراك'} بقيمة ${validatedData.amount} د.ع${validatedData.isDownPayment ? ' (عربون)' : ''}`,
        relatedId: incomeEntry.id,
      });
      
      res.status(201).json(incomeEntry);
    } catch (error) {
      console.error("Error creating income entry:", error);
      res.status(400).json({ message: "بيانات الإدخال غير صحيحة" });
    }
  });

  app.put('/api/income/:id', isAuthenticated, upload.single('receipt'), async (req, res) => {
    try {
      const validatedData = insertIncomeEntrySchema.parse({
        ...req.body,
        receiptUrl: req.file ? `/uploads/${req.file.filename}` : req.body.receiptUrl
      });
      
      const incomeEntry = await storage.updateIncomeEntry(req.params.id, validatedData);
      
      if (!incomeEntry) {
        return res.status(404).json({ message: "الإدخال غير موجود" });
      }
      
      // Log activity
      await storage.createActivity({
        type: 'income_updated',
        description: `تم تعديل إدخال بقيمة ${validatedData.amount} د.ع`,
        relatedId: incomeEntry.id,
      });
      
      res.json(incomeEntry);
    } catch (error) {
      console.error("Error updating income entry:", error);
      res.status(400).json({ message: "فشل في تعديل الإدخال" });
    }
  });

  app.delete('/api/income/:id', isAuthenticated, async (req, res) => {
    try {
      const incomeEntry = await storage.getIncomeEntry(req.params.id);
      if (!incomeEntry) {
        return res.status(404).json({ message: "الإدخال غير موجود" });
      }
      
      await storage.deleteIncomeEntry(req.params.id);
      
      // Log activity
      await storage.createActivity({
        type: 'income_deleted',
        description: `تم حذف إدخال بقيمة ${incomeEntry.amount} د.ع`,
        relatedId: incomeEntry.id,
      });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting income entry:", error);
      res.status(500).json({ message: "فشل في حذف الإدخال" });
    }
  });

  app.get('/api/income/prints', isAuthenticated, async (req, res) => {
    try {
      const printEntries = await storage.getPrintIncomeEntries();
      res.json(printEntries);
    } catch (error) {
      console.error("Error fetching print entries:", error);
      res.status(500).json({ message: "فشل في جلب المطبوعات" });
    }
  });

  // Expense routes
  app.get('/api/expenses', isAuthenticated, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const expenseEntries = await storage.getExpenseEntries(start, end);
      res.json(expenseEntries);
    } catch (error) {
      console.error("Error fetching expense entries:", error);
      res.status(500).json({ message: "فشل في جلب الإخراجات" });
    }
  });

  app.post('/api/expenses', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertExpenseEntrySchema.parse(req.body);
      const expenseEntry = await storage.createExpenseEntry(validatedData);
      
      // Log activity
      await storage.createActivity({
        type: 'expense_added',
        description: `تم تسجيل إخراج: ${validatedData.reason} بقيمة ${validatedData.amount} د.ع`,
        relatedId: expenseEntry.id,
      });
      
      res.status(201).json(expenseEntry);
    } catch (error) {
      console.error("Error creating expense entry:", error);
      res.status(400).json({ message: "بيانات الإخراج غير صحيحة" });
    }
  });

  app.put('/api/expenses/:id', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertExpenseEntrySchema.parse(req.body);
      const expenseEntry = await storage.updateExpenseEntry(req.params.id, validatedData);
      
      if (!expenseEntry) {
        return res.status(404).json({ message: "الإخراج غير موجود" });
      }
      
      // Log activity
      await storage.createActivity({
        type: 'expense_updated',
        description: `تم تعديل إخراج: ${validatedData.reason} بقيمة ${validatedData.amount} د.ع`,
        relatedId: expenseEntry.id,
      });
      
      res.json(expenseEntry);
    } catch (error) {
      console.error("Error updating expense entry:", error);
      res.status(400).json({ message: "فشل في تعديل الإخراج" });
    }
  });

  app.delete('/api/expenses/:id', isAuthenticated, async (req, res) => {
    try {
      const expenseEntry = await storage.getExpenseEntry(req.params.id);
      if (!expenseEntry) {
        return res.status(404).json({ message: "الإخراج غير موجود" });
      }
      
      await storage.deleteExpenseEntry(req.params.id);
      
      // Log activity
      await storage.createActivity({
        type: 'expense_deleted',
        description: `تم حذف إخراج: ${expenseEntry.reason} بقيمة ${expenseEntry.amount} د.ع`,
        relatedId: expenseEntry.id,
      });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting expense entry:", error);
      res.status(500).json({ message: "فشل في حذف الإخراج" });
    }
  });

  // Employee routes
  app.get('/api/employees', isAuthenticated, async (req, res) => {
    try {
      const employees = await storage.getEmployees();
      res.json(employees);
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({ message: "فشل في جلب الموظفين" });
    }
  });

  app.post('/api/employees', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertEmployeeSchema.parse(req.body);
      const employee = await storage.createEmployee(validatedData);
      res.status(201).json(employee);
    } catch (error) {
      console.error("Error creating employee:", error);
      res.status(400).json({ message: "بيانات الموظف غير صحيحة" });
    }
  });

  app.delete('/api/employees/:id', isAuthenticated, async (req, res) => {
    try {
      await storage.deleteEmployee(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting employee:", error);
      res.status(500).json({ message: "فشل في حذف الموظف" });
    }
  });

  // Reports route
  app.post('/api/reports/generate', isAuthenticated, async (req, res) => {
    try {
      const { startDate, endDate, reportType } = req.body;
      
      // Get data based on report type
      let reportData: any = {
        period: `${startDate} إلى ${endDate}`,
        type: reportType,
        generatedAt: new Date().toISOString(),
        generatedBy: "IQR Control System",
      };

      // Fetch data based on report type
      if (reportType === "financial" || reportType === "comprehensive") {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        reportData.income = await storage.getIncomeEntries(start, end);
        reportData.expenses = await storage.getExpenseEntries(start, end);
        
        // Calculate totals
        reportData.totalIncome = reportData.income.reduce((sum: number, entry: any) => sum + Number(entry.amount), 0);
        reportData.totalExpenses = reportData.expenses.reduce((sum: number, entry: any) => sum + Number(entry.amount), 0);
        reportData.netProfit = reportData.totalIncome - reportData.totalExpenses;
      }

      if (reportType === "customers" || reportType === "comprehensive") {
        reportData.customers = await storage.getCustomers();
        reportData.totalCustomers = reportData.customers.length;
        
        // Customer analytics
        reportData.expiredCustomers = reportData.customers.filter((c: any) => new Date(c.expiryDate) < new Date());
        reportData.activeCustomers = reportData.customers.filter((c: any) => c.isActive && new Date(c.expiryDate) >= new Date());
        reportData.expiringSoon = reportData.customers.filter((c: any) => {
          const expiry = new Date(c.expiryDate);
          const today = new Date();
          const diffTime = expiry.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 30 && diffDays > 0;
        });
      }

      if (reportType === "employees" || reportType === "comprehensive") {
        reportData.employees = await storage.getEmployees();
        reportData.totalEmployees = reportData.employees.length;
        reportData.totalSalaries = reportData.employees.reduce((sum: number, emp: any) => sum + Number(emp.salary || 0), 0);
      }

      if (reportType === "prints" || reportType === "comprehensive") {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const allIncome = await storage.getIncomeEntries(start, end);
        
        reportData.printIncome = allIncome.filter((entry: any) => entry.type === 'prints');
        reportData.totalPrintIncome = reportData.printIncome.reduce((sum: number, entry: any) => sum + Number(entry.amount), 0);
      }

      // Add summary statistics
      const dashboardStats = await storage.getDashboardStats();
      reportData.summary = dashboardStats;

      res.json({
        message: "تم إنشاء التقرير بنجاح",
        data: reportData,
        success: true
      });
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ message: "فشل في إنشاء التقرير" });
    }
  });

  // User management routes
  app.get('/api/users', isAuthenticated, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Don't return password hashes in the response
      const safeUsers = users.map(user => {
        const { password, ...safeUser } = user;
        return safeUser;
      });
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "فشل في جلب المستخدمين" });
    }
  });

  app.post('/api/users', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertManualUserSchema.parse(req.body);
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ message: "اسم المستخدم موجود بالفعل" });
      }
      
      // Hash the password
      const hashedPassword = await hashPassword(validatedData.password);
      
      const user = await storage.createManualUser({
        ...validatedData,
        password: hashedPassword,
      });
      
      // Don't return password hash in the response
      const { password, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error.name === 'ZodError') {
        res.status(400).json({ message: "بيانات المستخدم غير صحيحة" });
      } else {
        res.status(500).json({ message: "فشل في إنشاء المستخدم" });
      }
    }
  });

  // Receivables routes (المستحقات)
  app.get('/api/receivables', isAuthenticated, async (req, res) => {
    try {
      const receivables = await storage.getReceivables();
      res.json(receivables);
    } catch (error) {
      console.error("Error fetching receivables:", error);
      res.status(500).json({ message: "فشل في جلب المستحقات" });
    }
  });

  app.post('/api/receivables', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertReceivableSchema.parse(req.body);
      const receivable = await storage.createReceivable(validatedData);
      res.status(201).json(receivable);
    } catch (error) {
      console.error("Error creating receivable:", error);
      res.status(400).json({ message: "بيانات الدين غير صحيحة" });
    }
  });

  app.patch('/api/receivables/:id/pay', isAuthenticated, async (req, res) => {
    try {
      // Get receivable details first
      const receivableToPayResult = await storage.getReceivables();
      const receivableToPay = receivableToPayResult.find((r: any) => r.id === req.params.id);
      
      if (!receivableToPay) {
        return res.status(404).json({ message: "المستحق غير موجود" });
      }

      if (receivableToPay.isPaid) {
        return res.status(400).json({ message: "تم تسديد هذا المستحق مسبقاً" });
      }

      // Mark receivable as paid
      const receivable = await storage.markReceivableAsPaid(req.params.id);
      
      // Add the remaining amount to income entries
      await storage.createIncomeEntry({
        type: 'prints',
        amount: receivable.remainingAmount,
        customerId: receivable.customerId,
        isDownPayment: false,
        description: `تسديد المبلغ المتبقي من العربون - ${receivable.customerName}`,
        receiptUrl: null,
        printType: null,
        totalAmount: null,
      });

      // Log activity
      await storage.createActivity({
        type: 'receivable_paid',
        description: `تم تسديد المستحق بقيمة ${receivable.remainingAmount} د.ع للعميل ${receivable.customerName}`,
        relatedId: receivable.id,
      });

      // Invalidate dashboard stats
      res.json(receivable);
    } catch (error) {
      console.error("Error marking receivable as paid:", error);
      res.status(500).json({ message: "فشل في تسديد الدين" });
    }
  });

  app.delete('/api/receivables/:id', isAuthenticated, async (req, res) => {
    try {
      await storage.deleteReceivable(req.params.id);
      res.json({ message: "تم حذف الدين بنجاح" });
    } catch (error) {
      console.error("Error deleting receivable:", error);
      res.status(500).json({ message: "فشل في حذف الدين" });
    }
  });

  // Serve uploaded files
  app.use('/uploads', express.static('uploads'));

  const httpServer = createServer(app);
  return httpServer;
}
