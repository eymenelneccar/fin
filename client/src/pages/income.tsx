import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "wouter";
import { ArrowRight, Plus, DollarSign, Upload, Edit2, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FileUpload } from "@/components/ui/file-upload";
import { useToast } from "@/hooks/use-toast";
import { insertIncomeEntrySchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function Income() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [incomeType, setIncomeType] = useState("");
  const [isDownPayment, setIsDownPayment] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(insertIncomeEntrySchema.extend({
      customerId: insertIncomeEntrySchema.shape.customerId.optional().nullable(),
      printType: insertIncomeEntrySchema.shape.printType.optional().nullable(),
      totalAmount: insertIncomeEntrySchema.shape.totalAmount.optional().nullable(),
      description: insertIncomeEntrySchema.shape.description.optional().nullable(),
    })),
    defaultValues: {
      type: "",
      printType: "",
      amount: "",
      totalAmount: "",
      isDownPayment: false,
      customerId: "",
      description: "",
    },
  });

  const { data: incomeEntries, isLoading, error: incomeError } = useQuery<any[]>({
    queryKey: ["/api/income"]
  });

  if (incomeError && isUnauthorizedError(incomeError as Error)) {
    toast({
      title: "غير مصرح",
      description: "جاري إعادة تسجيل الدخول...",
      variant: "destructive",
    });
    setTimeout(() => {
      window.location.href = "/api/login";
    }, 500);
  }

  const { data: customers = [], error: customersFetchError } = useQuery<any[]>({
    queryKey: ["/api/customers"]
  });

  if (customersFetchError && isUnauthorizedError(customersFetchError as Error)) {
    toast({
      title: "غير مصرح",
      description: "جاري إعادة تسجيل الدخول...",
      variant: "destructive",
    });
    setTimeout(() => {
      window.location.href = "/api/login";
    }, 500);
  }

  const addIncomeMutation = useMutation({
    mutationFn: async (data: any) => {
      const formData = new FormData();
      Object.keys(data).forEach(key => {
        const value = data[key];
        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, String(value));
        }
      });
      
      if (selectedFile) {
        formData.append('receipt', selectedFile);
      }

      return await fetch("/api/income", {
        method: "POST",
        body: formData,
        credentials: "include",
      }).then(async res => {
        if (!res.ok) {
          const errorText = await res.text();
          console.error('Income creation error:', errorText);
          throw new Error(`${res.status}: ${errorText}`);
        }
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setIsAddDialogOpen(false);
      form.reset();
      setSelectedFile(null);
      setIncomeType("");
      toast({
        title: "تم بنجاح",
        description: "تم تسجيل الإدخال بنجاح",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "غير مصرح",
          description: "جاري إعادة تسجيل الدخول...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "خطأ",
        description: "فشل في تسجيل الإدخال",
        variant: "destructive",
      });
    },
  });

  const editIncomeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const formData = new FormData();
      Object.keys(data).forEach(key => {
        if (data[key] !== null && data[key] !== undefined && data[key] !== '') {
          formData.append(key, data[key]);
        }
      });
      
      if (selectedFile) {
        formData.append('receipt', selectedFile);
      }

      return await fetch(`/api/income/${id}`, {
        method: "PUT",
        body: formData,
        credentials: "include",
      }).then(async res => {
        if (!res.ok) {
          throw new Error(`${res.status}: ${await res.text()}`);
        }
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setIsEditDialogOpen(false);
      setEditingEntry(null);
      form.reset();
      setSelectedFile(null);
      setIncomeType("");
      toast({
        title: "تم بنجاح",
        description: "تم تعديل الإدخال بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: "فشل في تعديل الإدخال",
        variant: "destructive",
      });
    },
  });

  const deleteIncomeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/income/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "تم بنجاح",
        description: "تم حذف الإدخال بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: "فشل في حذف الإدخال",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: any) => {
    console.log('Form submitted with data:', data);
    console.log('Form errors:', form.formState.errors);
    
    // Validate down payment requirements
    if (isDownPayment) {
      if (!data.totalAmount || Number(data.totalAmount) <= 0) {
        toast({
          title: "خطأ",
          description: "المبلغ الكامل مطلوب عند اختيار العربون",
          variant: "destructive",
        });
        return;
      }
      if (Number(data.totalAmount) < Number(data.amount)) {
        toast({
          title: "خطأ",
          description: "المبلغ الكامل يجب أن يكون أكبر من أو يساوي المبلغ المدفوع",
          variant: "destructive",
        });
        return;
      }
    }

    if (editingEntry) {
      editIncomeMutation.mutate({ id: editingEntry.id, data });
    } else {
      addIncomeMutation.mutate(data);
    }
  };

  const handleEdit = (entry: any) => {
    setEditingEntry(entry);
    form.reset({
      type: entry.type,
      printType: entry.printType || "",
      amount: entry.amount.toString(),
      customerId: entry.customerId || "",
      description: entry.description || ""
    });
    setIncomeType(entry.type);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الإدخال؟')) {
      deleteIncomeMutation.mutate(id);
    }
  };

  const handleTypeChange = (value: string) => {
    setIncomeType(value);
    form.setValue("type", value);
    if (value !== "prints") {
      form.setValue("printType", "");
    }
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Header />
      
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowRight className="w-4 h-4 ml-2" />
                العودة للرئيسية
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-page-title">إدارة الإدخالات</h1>
              <p className="text-gray-300" data-testid="text-page-subtitle">تسجيل الحوالات والمطبوعات</p>
            </div>
          </div>
          
          <Dialog 
            open={isAddDialogOpen || isEditDialogOpen} 
            onOpenChange={(open) => {
              if (!open) {
                setIsAddDialogOpen(false);
                setIsEditDialogOpen(false);
                setEditingEntry(null);
                form.reset();
                setSelectedFile(null);
                setIncomeType("");
                setIsDownPayment(false);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button 
                className="gradient-green hover:scale-105 transition-transform" 
                data-testid="button-add-income"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="w-4 h-4 ml-2" />
                إضافة إدخال
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg glass-card border-white/20">
              <DialogHeader>
                <DialogTitle data-testid="text-dialog-title">
                  {editingEntry ? 'تعديل الإدخال' : 'إضافة إدخال جديد'}
                </DialogTitle>
              </DialogHeader>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>نوع الحوالة</FormLabel>
                        <Select onValueChange={handleTypeChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="glass-card border-white/20" data-testid="select-income-type">
                              <SelectValue placeholder="اختر نوع الحوالة" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="prints">مطبوعات</SelectItem>
                            <SelectItem value="subscription">اشتراك</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {incomeType === "prints" && (
                    <FormField
                      control={form.control}
                      name="printType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>نوع المطبوع</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="أدخل نوع المطبوع" 
                              className="glass-card border-white/20 focus:border-green-400"
                              data-testid="input-print-type"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{isDownPayment ? "المبلغ المدفوع (العربون) - دينار عراقي" : "المبلغ (دينار عراقي)"}</FormLabel>
                        <FormControl>
                          <Input 
                            type="number"
                            placeholder="0" 
                            className="glass-card border-white/20 focus:border-green-400"
                            data-testid="input-amount"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center space-x-2 space-x-reverse p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <input
                      type="checkbox"
                      id="isDownPayment"
                      checked={isDownPayment}
                      onChange={(e) => {
                        setIsDownPayment(e.target.checked);
                        form.setValue("isDownPayment", e.target.checked);
                        if (!e.target.checked) {
                          form.setValue("totalAmount", "");
                        }
                      }}
                      className="w-4 h-4 rounded border-white/20"
                      data-testid="checkbox-down-payment"
                    />
                    <div className="flex-1">
                      <Label htmlFor="isDownPayment" className="text-sm cursor-pointer font-semibold">
                        عربون (دفعة مقدمة)
                      </Label>
                      {isDownPayment && (
                        <p className="text-xs text-purple-300 mt-1">
                          ⚠️ يجب إدخال المبلغ الكامل أدناه
                        </p>
                      )}
                    </div>
                  </div>

                  {isDownPayment && (
                    <FormField
                      control={form.control}
                      name="totalAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-purple-300 font-semibold">
                            المبلغ الكامل (دينار عراقي) *
                          </FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              placeholder="أدخل المبلغ الكامل المستحق" 
                              className="glass-card border-purple-400/40 focus:border-purple-400 text-lg"
                              data-testid="input-total-amount"
                              {...field} 
                            />
                          </FormControl>
                          <p className="text-xs text-gray-400 mt-1">
                            المبلغ الكامل يجب أن يكون أكبر من أو يساوي المبلغ المدفوع أعلاه
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>العميل</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="glass-card border-white/20" data-testid="select-customer">
                              <SelectValue placeholder="اختر العميل" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers?.map((customer: any) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div>
                    <Label className="text-sm font-medium mb-2 block">رفع الفيش الإلكتروني</Label>
                    <FileUpload 
                      onFileSelect={setSelectedFile}
                      accept="image/*,application/pdf"
                      data-testid="file-upload-receipt"
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full gradient-green hover:scale-105 transition-transform"
                    disabled={addIncomeMutation.isPending || editIncomeMutation.isPending}
                    data-testid="button-submit-income"
                  >
                    {(addIncomeMutation.isPending || editIncomeMutation.isPending) 
                      ? "جاري الحفظ..." 
                      : editingEntry 
                        ? "تحديث الإدخال" 
                        : "تسجيل الإدخال"
                    }
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Income Entries List */}
        <GlassCard className="p-6">
          <h2 className="text-xl font-semibold mb-6" data-testid="text-income-list-title">قائمة الإدخالات</h2>
          
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-400">جاري تحميل الإدخالات...</p>
            </div>
          ) : incomeEntries?.length ? (
            <div className="grid gap-4">
              {incomeEntries.map((entry: any, index: number) => (
                <GlassCard 
                  key={entry.id} 
                  className="p-6"
                  data-testid={`card-income-${index}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 space-x-reverse">
                      <div className={`w-12 h-12 gradient-${entry.type === 'prints' ? 'orange' : 'blue'} rounded-full flex items-center justify-center`}>
                        <DollarSign className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold" data-testid={`text-income-type-${index}`}>
                          {entry.type === 'prints' ? 'مطبوعات' : 'اشتراك'}
                          {entry.printType && ` - ${entry.printType}`}
                        </h3>
                        <p className="text-2xl font-bold text-green-400" data-testid={`text-income-amount-${index}`}>
                          {entry.amount} د.ع
                        </p>
                        <p className="text-sm text-gray-400" data-testid={`text-income-date-${index}`}>
                          {new Date(entry.createdAt).toLocaleDateString('ar-IQ')}
                        </p>
                        {entry.description && (
                          <p className="text-sm text-gray-300" data-testid={`text-income-description-${index}`}>
                            {entry.description}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-left flex flex-col gap-2">
                      {entry.receiptUrl && (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="border-blue-400 text-blue-400 hover:bg-blue-400/10"
                          data-testid={`button-view-receipt-${index}`}
                        >
                          <a 
                            href={entry.receiptUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <Upload className="w-4 h-4 ml-1" />
                            عرض الفيش
                          </a>
                        </Button>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-yellow-400 text-yellow-400 hover:bg-yellow-400/10"
                          onClick={() => handleEdit(entry)}
                          data-testid={`button-edit-income-${index}`}
                        >
                          <Edit2 className="w-4 h-4 ml-1" />
                          تعديل
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-400 text-red-400 hover:bg-red-400/10"
                          onClick={() => handleDelete(entry.id)}
                          disabled={deleteIncomeMutation.isPending}
                          data-testid={`button-delete-income-${index}`}
                        >
                          <Trash2 className="w-4 h-4 ml-1" />
                          حذف
                        </Button>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p data-testid="text-no-income">لا توجد إدخالات مسجلة بعد</p>
              <p className="text-sm mt-2">ابدأ بتسجيل أول إدخال</p>
            </div>
          )}
        </GlassCard>
      </main>
    </div>
  );
}
