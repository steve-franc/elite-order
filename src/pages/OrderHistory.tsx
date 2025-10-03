import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Receipt, Calendar } from "lucide-react";
import { format } from "date-fns";

interface Order {
  id: string;
  order_number: number;
  total: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

const OrderHistory = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h2 className="text-3xl font-bold">Order History</h2>
          <p className="text-muted-foreground">View and reprint past orders</p>
        </div>

        {loading && <p className="text-center text-muted-foreground">Loading orders...</p>}

        {!loading && orders.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No orders yet</p>
              <Button onClick={() => navigate("/order/create")}>Create First Order</Button>
            </CardContent>
          </Card>
        )}

        {!loading && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((order) => (
              <Card
                key={order.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/receipt/${order.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/receipt/${order.id}`);
                        }}
                      >
                        <Receipt className="h-4 w-4 mr-1" />
                        View Receipt
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default OrderHistory;
