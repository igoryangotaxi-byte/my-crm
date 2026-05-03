import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, ChevronDown, Download } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { OrderDetailModal } from "./OrderDetailModal";

interface Order {
  id: string;
  client: string;
  status: "Canceled" | "Completed" | "In Progress" | "waiting";
  scheduledFor: string;
  route: string;
  secret: string;
  scenario: string;
}

export function Orders() {
  const [filterDate, setFilterDate] = useState("03/05/2026");
  const [filterClient, setFilterClient] = useState("All clients");
  const [filterStatus, setFilterStatus] = useState("All statuses");
  const [filterArea, setFilterArea] = useState("SUM desc");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [orders] = useState<Order[]>([
    {
      id: "a0b01f99b4dd",
      client: "SHAMKO",
      status: "waiting",
      scheduledFor: "2026-05-03T03:13:00+03:00",
      route: "44 גרשון אגרון ירושלים → 1 ז׳בוטינסקי בני ברק",
      secret: "80.00",
      scenario: "Order to AdminLink",
    },
    {
      id: "1419544f2529ee",
      client: "SHAMKO",
      status: "waiting",
      scheduledFor: "2026-05-03T53:23:00+03:00",
      route: "44 גרשון אגרון ירושלים → ",
      secret: "80.00",
      scenario: "Order to AdminLink",
    },
    {
      id: "5b60b87f1e94b8",
      client: "SHAMKO",
      status: "In Progress",
      scheduledFor: "2026-05-03T09:00:00+03:00",
      route: "44 גרשון אגרון ירושלים → ",
      secret: "80.00",
      scenario: "Order to AdminLink",
    },
    {
      id: "f698f260f4b878",
      client: "SHAMKO",
      status: "waiting",
      scheduledFor: "2026-05-03T09:00:00+03:00",
      route: "44 גרשון אגרון ירושלים → ",
      secret: "80.00",
      scenario: "Order to AdminLink",
    },
    {
      id: "1888f7b0008f8",
      client: "yoomi",
      status: "Canceled",
      scheduledFor: "2026-05-02T53:18:00+03:00",
      route: "44 גרשון אגרון ירושלים → ",
      secret: "835.80",
      scenario: "Order to AdminLink",
    },
    {
      id: "9c08ab5f2c54e",
      client: "yoomi",
      status: "In Progress",
      scheduledFor: "2026-05-02T53:18:00+03:00",
      route: "44 גרשון אגרון ירושלים → ",
      secret: "835.80",
      scenario: "Order to AdminLink",
    },
    {
      id: "a03a244a02bbd",
      client: "yoomi",
      status: "Canceled",
      scheduledFor: "2026-04-30T05:30:00+03:00",
      route: "44 גרשון אגרון ירושלים → ",
      secret: "835.80",
      scenario: "Order to AdminLink",
    },
    {
      id: "1ebb5f524658e8",
      client: "P x 20 (soon)",
      status: "Completed",
      scheduledFor: "2026-05-02T30:00:00+03:00",
      route: "44 גרשון אגרון ירושלים → ",
      secret: "835.80",
      scenario: "Order to AdminLink",
    },
    {
      id: "1b4f71a5586e8",
      client: "SHAMKO",
      status: "Canceled",
      scheduledFor: "2026-04-29T41:33:00+03:00",
      route: "44 גרשון אגרון ירושלים → ",
      secret: "835.80",
      scenario: "Order to AdminLink",
    },
    {
      id: "48df67b255f802",
      client: "yoomi",
      status: "In Progress",
      scheduledFor: "2026-04-29T00:00:00+03:00",
      route: "44 גרשון אגרון ירושלים → ",
      secret: "835.80",
      scenario: "Order to AdminLink",
    },
  ]);

  const getStatusColor = (status: Order["status"]) => {
    switch (status) {
      case "Canceled":
        return "bg-red-100 text-red-700 border-red-300";
      case "Completed":
        return "bg-green-100 text-green-700 border-green-300";
      case "In Progress":
        return "bg-blue-100 text-blue-700 border-blue-300";
      case "waiting":
        return "bg-yellow-100 text-yellow-700 border-yellow-300";
    }
  };

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-6">
          <h2 className="text-3xl text-black mb-2">Operations</h2>
          <p className="text-gray-700">With Filters and details</p>
        </div>

        {/* Filters */}
        <GlassCard className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-gray-600 text-xs mb-2">DATE</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type="text"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/50 border border-white/70 text-black text-sm focus:outline-none focus:ring-2 focus:ring-red-500/60 backdrop-blur-xl"
                />
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-gray-600 text-xs mb-2">CLIENT</label>
              <div className="relative">
                <select
                  value={filterClient}
                  onChange={(e) => setFilterClient(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-white/70 text-black text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-red-500/60 backdrop-blur-xl cursor-pointer"
                >
                  <option>All clients</option>
                  <option>SHAMKO</option>
                  <option>yoomi</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-gray-600 text-xs mb-2">STATUS</label>
              <div className="relative">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-white/70 text-black text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-red-500/60 backdrop-blur-xl cursor-pointer"
                >
                  <option>All statuses</option>
                  <option>Completed</option>
                  <option>Canceled</option>
                  <option>In Progress</option>
                  <option>waiting</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-gray-600 text-xs mb-2">SORT</label>
              <div className="relative">
                <select
                  value={filterArea}
                  onChange={(e) => setFilterArea(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-white/70 text-black text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-red-500/60 backdrop-blur-xl cursor-pointer"
                >
                  <option>SUM desc</option>
                  <option>SUM asc</option>
                  <option>Date desc</option>
                  <option>Date asc</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-gray-600">ORDERS</p>
                <p className="text-2xl text-black">6</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">RIDES</p>
                <p className="text-2xl text-black">3</p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-2 rounded-lg bg-white/40 backdrop-blur-xl border border-white/60 text-gray-700 hover:bg-white/60 transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </motion.button>
          </div>
        </GlassCard>

        {/* Table */}
        <GlassCard>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-300/60">
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Client</th>
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Scheduled For</th>
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Route</th>
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Secret Pass</th>
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Scenario</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {orders.map((order, index) => (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      onClick={() => setSelectedOrder(order)}
                      className="border-b border-gray-200/60 hover:bg-white/40 transition-all duration-200 cursor-pointer"
                    >
                      <td className="py-4 px-4">
                        <span className="text-black text-sm">{order.client}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs border ${getStatusColor(
                            order.status
                          )}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-black text-sm">{order.scheduledFor}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-gray-700 text-sm">{order.route}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-black text-sm">{order.secret}</span>
                      </td>
                      <td className="py-4 px-4">
                        <button className="text-blue-600 hover:text-blue-700 text-sm underline">
                          {order.scenario}
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </GlassCard>

        {/* Order Detail Modal */}
        {selectedOrder && (
          <OrderDetailModal
            isOpen={!!selectedOrder}
            onClose={() => setSelectedOrder(null)}
            orderData={{
              orderId: selectedOrder.id,
              pointA: selectedOrder.route.split(" → ")[0] || "Not provided",
              pointB: selectedOrder.route.split(" → ")[1] || "Not provided",
              scheduledFor: selectedOrder.scheduledFor,
              status: selectedOrder.status,
              clientCost: selectedOrder.secret,
            }}
          />
        )}
      </motion.div>
    </div>
  );
}
