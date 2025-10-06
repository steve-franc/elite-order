import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Receipt, Calendar, TrendingUp, Edit, Trash2, Archive } from "lucide-react";
import { format, subHours } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface Order {
  id: string;
  order_number: number;
  total: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

interface DailyReport {
  total_orders: number;
  total_revenue: number;
  payment_methods: Record<string, { count: number; total: number }>;
}

const OrderHistory = () => {
  const navigate = useNavigate();
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [archivedOrders, setArchivedOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const twentyFourHoursAgo = subHours(new Date(), 24);
      
      const { data: allOrders, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const recent: Order[] = [];
      const archived: Order[] = [];

      allOrders?.forEach((order) => {
        const orderDate = new Date(order.created_at);
        if (orderDate >= twentyFourHoursAgo) {
          recent.push(order);
        } else {
          archived.push(order);
        }
      });

      setRecentOrders(recent);
      setArchivedOrders(archived);
    } catch (error: any) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;

    try {
      // First delete order items
      const { error: itemsError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", orderToDelete);

      if (itemsError) throw itemsError;

      // Then delete the order
      const { error: orderError } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderToDelete);

      if (orderError) throw orderError;

      toast.success("Order deleted successfully");
      fetchOrders();
    } catch (error: any) {
      toast.error("Failed to delete order");
    } finally {
      setDeleteDialogOpen(false);
      setOrderToDelete(null);
    }
  };

  const confirmDelete = (orderId: string) => {
    setOrderToDelete(orderId);
    setDeleteDialogOpen(true);
  };

  const handleEndDay = async () => {
    setGeneratingReport(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get today's date
      const today = format(new Date(), "yyyy-MM-dd");

      // Fetch today's orders
      const { data: todayOrders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`)
        .eq("staff_id", user.id);

      if (ordersError) throw ordersError;

      if (!todayOrders || todayOrders.length === 0) {
        toast.error("No orders found for today");
        setGeneratingReport(false);
        return;
      }

      // Calculate totals
      const totalRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total), 0);
      const paymentMethods: Record<string, { count: number; total: number }> = {};

      todayOrders.forEach((order) => {
        if (!paymentMethods[order.payment_method]) {
          paymentMethods[order.payment_method] = { count: 0, total: 0 };
        }
        paymentMethods[order.payment_method].count++;
        paymentMethods[order.payment_method].total += Number(order.total);
      });

      // Save daily report
      const { error: reportError } = await supabase
        .from("daily_reports")
        .upsert({
          staff_id: user.id,
          report_date: today,
          total_orders: todayOrders.length,
          total_revenue: totalRevenue,
          payment_methods: paymentMethods,
        });

      if (reportError) throw reportError;

      // Set report data and show dialog
      setDailyReport({
        total_orders: todayOrders.length,
        total_revenue: totalRevenue,
        payment_methods: paymentMethods,
      });
      setShowReport(true);

      toast.success("Daily report generated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  };

  const renderOrderCard = (order: Order) => (
    <Card key={order.id} className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-xl flex items-center gap-2">
              Order #{order.order_number}
              <Badge variant="outline" className="font-normal">
                {order.payment_method}
              </Badge>
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <Calendar className="h-3 w-3" />
              {format(new Date(order.created_at), "PPp")}
            </CardDescription>
            {order.notes && (
              <CardDescription className="text-sm mt-2">
                Note: {order.notes}
              </CardDescription>
            )}
          </div>
          <div className="text-right space-y-2">
            <p className="text-2xl font-bold text-primary">
              ${order.total.toFixed(2)}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/receipt/${order.id}`)}
              >
                <Receipt className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/receipt/${order.id}?edit=true`)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => confirmDelete(order.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Order History</h2>
            <p className="text-muted-foreground">Manage and track all orders</p>
          </div>
          <Button
            onClick={handleEndDay}
            disabled={generatingReport}
            size="lg"
            className="gap-2"
          >
            <TrendingUp className="h-4 w-4" />
            {generatingReport ? "Generating..." : "End Day"}
          </Button>
        </div>

        {loading && <p className="text-center text-muted-foreground">Loading orders...</p>}

        {!loading && recentOrders.length === 0 && archivedOrders.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No orders yet</p>
              <Button onClick={() => navigate("/order/create")}>Create First Order</Button>
            </CardContent>
          </Card>
        )}

        {!loading && (recentOrders.length > 0 || archivedOrders.length > 0) && (
          <Tabs defaultValue="recent" className="space-y-4">
            <TabsList>
              <TabsTrigger value="recent" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Recent (24h)
                <Badge variant="secondary" className="ml-1">
                  {recentOrders.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="archived" className="flex items-center gap-2">
                <Archive className="h-4 w-4" />
                Archives
                <Badge variant="secondary" className="ml-1">
                  {archivedOrders.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recent" className="space-y-4">
              {recentOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">No recent orders</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {recentOrders.map(renderOrderCard)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="archived" className="space-y-4">
              {archivedOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">No archived orders</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {archivedOrders.map(renderOrderCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrder}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl">Daily Report</DialogTitle>
            <DialogDescription>
              Summary for {format(new Date(), "PPP")}
            </DialogDescription>
          </DialogHeader>

          {dailyReport && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Total Orders</CardDescription>
                    <CardTitle className="text-3xl text-primary">
                      {dailyReport.total_orders}
                    </CardTitle>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Total Revenue</CardDescription>
                    <CardTitle className="text-3xl text-primary">
                      ${dailyReport.total_revenue.toFixed(2)}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-4">Payment Methods Breakdown</h3>
                <div className="space-y-3">
                  {Object.entries(dailyReport.payment_methods).map(([method, data]) => (
                    <div
                      key={method}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{method}</p>
                        <p className="text-sm text-muted-foreground">
                          {data.count} {data.count === 1 ? "order" : "orders"}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-primary">
                        ${data.total.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => window.print()}
                >
                  <Receipt className="h-4 w-4 mr-2" />
                  Print Report
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowReport(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default OrderHistory;
