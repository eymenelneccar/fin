import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, DollarSign, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function Receivables() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: receivables, isLoading, error } = useQuery({
    queryKey: ["/api/receivables"]
  });

  if (error && isUnauthorizedError(error as Error)) {
    toast({
      title: "غير مصرح",
      description: "جاري إعادة تسجيل الدخول...",
      variant: "destructive",
    });
    setTimeout(() => {
      window.location.href = "/api/login";
    }, 500);
  }

  const payReceivableMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("PATCH", `/api/receivables/${id}/pay`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receivables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "تم التسديد",
        description: "تم تسديد الدين وإضافة المبلغ للواردات بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: "فشل في تسديد الدين",
        variant: "destructive",
      });
    },
  });

  const deleteReceivableMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/receivables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receivables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "تم الحذف",
        description: "تم حذف الدين بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: "فشل في حذف الدين",
        variant: "destructive",
      });
    },
  });

  const handlePay = (id: string) => {
    payReceivableMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الدين؟')) {
      deleteReceivableMutation.mutate(id);
    }
  };

  // Calculate total unpaid
  const totalUnpaid = Array.isArray(receivables)
    ? receivables
        .filter((r: any) => !r.isPaid)
        .reduce((sum: number, r: any) => sum + Number(r.remainingAmount || 0), 0)
    : 0;

  return (
    <div className="min-h-screen gradient-bg">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowRight className="w-4 h-4 ml-2" />
                العودة للرئيسية
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-page-title">المستحقات</h1>
              <p className="text-gray-300" data-testid="text-page-subtitle">إدارة الديون والمستحقات</p>
            </div>
          </div>
        </div>

        {/* Summary Card */}
        <GlassCard className="p-4 md:p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-4 space-x-reverse">
              <div className="w-12 h-12 gradient-red rounded-full flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-gray-400">إجمالي المستحقات غير المسددة</p>
                <p className="text-2xl font-bold text-red-400">{totalUnpaid.toLocaleString()} د.ع</p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Receivables List */}
        <GlassCard className="p-4 md:p-6">
          <h2 className="text-xl font-semibold mb-6" data-testid="text-receivables-list-title">قائمة المستحقات</h2>
          
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-400">جاري تحميل المستحقات...</p>
            </div>
          ) : Array.isArray(receivables) && receivables.length ? (
            <div className="grid gap-4">
              {receivables.map((receivable: any, index: number) => (
                <GlassCard 
                  key={receivable.id} 
                  className="p-4 md:p-6"
                  data-testid={`card-receivable-${index}`}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-center space-x-4 space-x-reverse">
                      <div className={`w-12 h-12 ${receivable.isPaid ? 'gradient-green' : 'gradient-red'} rounded-full flex items-center justify-center flex-shrink-0`}>
                        {receivable.isPaid ? (
                          <CheckCircle2 className="w-6 h-6" />
                        ) : (
                          <Clock className="w-6 h-6" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold" data-testid={`text-receivable-customer-${index}`}>
                          {receivable.customerName}
                        </h3>
                        <p className="text-sm text-gray-400">
                          المبلغ الكامل: {Number(receivable.totalAmount).toLocaleString()} د.ع
                        </p>
                        <p className="text-sm text-gray-400">
                          المبلغ المدفوع (العربون): {Number(receivable.paidAmount).toLocaleString()} د.ع
                        </p>
                        <p className={`text-sm font-semibold ${receivable.isPaid ? 'text-green-400' : 'text-red-400'}`}>
                          المتبقي: {Number(receivable.remainingAmount).toLocaleString()} د.ع
                        </p>
                        {receivable.description && (
                          <p className="text-xs text-gray-500 mt-1">{receivable.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          التاريخ: {new Date(receivable.createdAt).toLocaleDateString('ar-IQ')}
                        </p>
                        {receivable.isPaid && receivable.paidAt && (
                          <p className="text-xs text-green-400 mt-1">
                            تم التسديد في: {new Date(receivable.paidAt).toLocaleDateString('ar-IQ')}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      {!receivable.isPaid && (
                        <Button
                          onClick={() => handlePay(receivable.id)}
                          disabled={payReceivableMutation.isPending}
                          className="gradient-green hover:scale-105 transition-transform text-xs md:text-sm"
                          data-testid={`button-pay-${index}`}
                        >
                          <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 ml-1" />
                          تسديد
                        </Button>
                      )}
                      <Button
                        onClick={() => handleDelete(receivable.id)}
                        variant="outline"
                        className="border-red-400 text-red-400 hover:bg-red-400/10 text-xs md:text-sm"
                        data-testid={`button-delete-${index}`}
                      >
                        <Trash2 className="w-3 h-3 md:w-4 md:h-4 ml-1" />
                        حذف
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p data-testid="text-no-receivables">لا توجد مستحقات مسجلة بعد</p>
              <p className="text-sm mt-2">سيتم إضافة المستحقات تلقائياً عند إضافة حوالة بعربون</p>
            </div>
          )}
        </GlassCard>
      </main>
    </div>
  );
}
