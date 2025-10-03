import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Plus, History } from "lucide-react";
import Layout from "@/components/Layout";

const Dashboard = () => {
  const navigate = useNavigate();

  const actions = [
    {
      title: "Create Order",
      description: "Start a new customer order",
      icon: Plus,
      onClick: () => navigate("/order/create"),
      gradient: "from-primary to-accent",
    },
    {
      title: "Menu Management",
      description: "Add or edit menu items",
      icon: BookOpen,
      onClick: () => navigate("/menu"),
      gradient: "from-accent to-primary",
    },
    {
      title: "Order History",
      description: "View past orders and receipts",
      icon: History,
      onClick: () => navigate("/orders"),
      gradient: "from-primary/80 to-accent/80",
    },
  ];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold mb-2">Dashboard</h2>
          <p className="text-muted-foreground">Quick access to all features</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Card
                key={action.title}
                className="hover:shadow-lg transition-shadow cursor-pointer group"
                onClick={action.onClick}
              >
                <CardHeader className="space-y-4">
                  <div
                    className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${action.gradient} flex items-center justify-center group-hover:scale-110 transition-transform`}
                  >
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{action.title}</CardTitle>
                    <CardDescription className="mt-1">{action.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button variant="ghost" className="w-full">
                    Open →
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
