# دليل النشر على Render - IQR Control System

## ✅ الحالة الحالية

### قاعدة البيانات
- **النوع**: Neon PostgreSQL
- **الحالة**: ✅ متصلة ومُحدَّثة بالكامل
- **الجداول**: 
  - ✅ users (المستخدمين)
  - ✅ customers (العملاء)
  - ✅ income_entries (الإدخالات) - **مع is_down_payment و total_amount**
  - ✅ expense_entries (الإخراجات)
  - ✅ employees (الموظفين)
  - ✅ receivables (المستحقات)
  - ✅ activities (الأنشطة)
  - ✅ session (الجلسات)

### التطبيق المحلي (Replit)
- **الحالة**: ✅ يعمل بشكل صحيح
- **المنفذ**: 5000
- **قاعدة البيانات**: مُزامنة بالكامل

---

## 📋 خطوات النشر على Render

### الخطوة 1: تحديث قاعدة بيانات Render

يجب تشغيل الأمر التالي على Render لتحديث قاعدة البيانات:

#### الطريقة أ: استخدام Render Shell
1. افتح **Render Dashboard**: https://dashboard.render.com
2. اختر **Web Service** الخاص بك
3. من القائمة الجانبية، اضغط على **"Shell"**
4. شغّل الأمر:
```bash
npm run db:push -- --force
```

#### الطريقة ب: تشغيل SQL مباشرة
إذا لم تعمل الطريقة أ، يمكنك تشغيل SQL مباشرة:

1. افتح **PostgreSQL Database** في Render
2. اضغط على **"Connect"** واختر **"External Connection"**
3. استخدم psql أو أي أداة SQL client:

```sql
-- إضافة الأعمدة المفقودة
ALTER TABLE income_entries 
ADD COLUMN IF NOT EXISTS is_down_payment BOOLEAN DEFAULT false;

ALTER TABLE income_entries 
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2);

-- إنشاء جدول المستحقات إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS receivables (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  income_entry_id VARCHAR REFERENCES income_entries(id),
  customer_id VARCHAR REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) NOT NULL,
  remaining_amount DECIMAL(10,2) NOT NULL,
  is_paid BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMP DEFAULT now(),
  paid_at TIMESTAMP
);
```

### الخطوة 2: إعادة النشر

بعد تحديث قاعدة البيانات:
1. ارجع إلى Render Dashboard
2. اضغط على **"Manual Deploy"** > **"Deploy latest commit"**
3. انتظر حتى يكتمل النشر

### الخطوة 3: التحقق

بعد اكتمال النشر:
1. افتح موقعك على Render
2. سجل الدخول:
   - **اسم المستخدم**: admin
   - **كلمة المرور**: admin123
3. جرب إضافة إدخال جديد مع عربون

---

## 🔧 متغيرات البيئة المطلوبة على Render

تأكد من إضافة المتغيرات التالية في Render:

```env
DATABASE_URL=<رابط قاعدة بيانات Neon>
SESSION_SECRET=<سر عشوائي قوي>
NODE_ENV=production
PORT=5000
```

---

## 📊 معلومات قاعدة البيانات

### رابط Neon الحالي
```
postgresql://neondb_owner:npg_j0uJzebEPgs4@ep-lively-pine-adpu1pz9-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

### هيكل الجداول الرئيسية

#### income_entries (جدول الإدخالات)
- `id` - معرّف فريد
- `customer_id` - معرّف العميل
- `type` - نوع الإدخال (prints/subscription)
- `print_type` - نوع المطبوعات (إذا كان prints)
- `amount` - المبلغ المدفوع
- **`is_down_payment`** - هل هو عربون (✅ تم إضافته)
- **`total_amount`** - المبلغ الكامل للعربون (✅ تم إضافته)
- `receipt_url` - رابط الإيصال
- `description` - وصف
- `created_at` - تاريخ الإنشاء

#### receivables (جدول المستحقات)
- `id` - معرّف فريد
- `income_entry_id` - معرّف الإدخال المرتبط
- `customer_id` - معرّف العميل
- `customer_name` - اسم العميل
- `total_amount` - المبلغ الكامل
- `paid_amount` - المبلغ المدفوع
- `remaining_amount` - المبلغ المتبقي
- `is_paid` - هل تم التسديد
- `created_at` - تاريخ الإنشاء
- `paid_at` - تاريخ التسديد

---

## 🚨 استكشاف الأخطاء

### مشكلة: "column is_down_payment does not exist"
**الحل**: قم بتشغيل `npm run db:push -- --force` على Render Shell

### مشكلة: الموقع لا يستجيب
**الحل**: تحقق من:
1. حالة قاعدة البيانات في Render Dashboard
2. Logs في Render لمعرفة الخطأ
3. متغيرات البيئة صحيحة

### مشكلة: لا يمكن تسجيل الدخول
**الحل**: 
- استخدم: admin / admin123
- إذا لم يعمل، قد تحتاج لإنشاء مستخدم جديد من Shell

---

## ✅ التحقق النهائي

بعد النشر، تأكد من:
- [ ] يمكن تسجيل الدخول
- [ ] يمكن إضافة عملاء
- [ ] يمكن إضافة إدخالات عادية
- [ ] يمكن إضافة إدخالات بعربون
- [ ] المستحقات تظهر بشكل صحيح
- [ ] التقارير تعمل

---

## 📞 الدعم

إذا واجهت أي مشكلة:
1. تحقق من Logs في Render Dashboard
2. تحقق من اتصال قاعدة البيانات
3. تأكد من تحديث قاعدة البيانات بالأوامر أعلاه
