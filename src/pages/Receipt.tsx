import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Printer, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { formatPrice } from "@/lib/currency";

interface OrderData {
  id: string;
  order_number: number;
  total: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
  currency: string;
}

interface OrderItemData {
  id: string;
  menu_item_name: string;
  quantity: number;
  price_at_time: number;
  subtotal: number;
}

const Receipt = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchOrderDetails();
    }
  }, [id]);

  const fetchOrderDetails = async () => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();

      if (orderError) throw orderError;

      const { data: itemsData, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id);

      if (itemsError) throw itemsError;

      setOrder(orderData);
      setOrderItems(itemsData || []);
    } catch (error: any) {
      toast.error("Failed to load receipt");
      navigate("/orders");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <Layout>
        <p className="text-center text-muted-foreground">Loading receipt...</p>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <p className="text-center text-muted-foreground">Order not found</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="print:hidden flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate("/orders")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print Receipt
          </Button>
        </div>

        <Card className="print:shadow-none">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-2xl">Restaurant POS</CardTitle>
            <p className="text-sm text-muted-foreground">Order Receipt</p>
            <Separator />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Order Number</p>
                <p className="font-bold text-lg">#{order.order_number}</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">Date & Time</p>
                <p className="font-medium">{format(new Date(order.created_at), "PPp")}</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="font-semibold">Order Items</p>
              {orderItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <div className="flex-1">
                    <p className="font-medium">{item.menu_item_name}</p>
                    <p className="text-muted-foreground">
                      {item.quantity} × {formatPrice(item.price_at_time, order.currency)}
                    </p>
                  </div>
                  <p className="font-medium">{formatPrice(item.subtotal, order.currency)}</p>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between text-xl font-bold">
                <span>Total</span>
                <span className="text-primary">{formatPrice(order.total, order.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment Method</span>
                <span className="font-medium">{order.payment_method}</span>
              </div>
              {order.notes && (
                <div className="pt-2">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm font-medium">{order.notes}</p>
                </div>
              )}
            </div>

            <Separator />

            <p className="text-center text-sm text-muted-foreground">
              Thank you for your business!
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Receipt;
