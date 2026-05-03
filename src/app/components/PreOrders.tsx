import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, ChevronDown, Users } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { PreOrderDetailModal } from "./PreOrderDetailModal";

interface PreOrder {
  id: string;
  client: string;
  status: "Unassigned" | "In Progress";
  scheduledFor: string;
  route: string;
  example: string;
  action: string;
}

export function PreOrders() {
  const [dateFrom, setDateFrom] = useState("dd/mm/yyyy");
  const [dateTo, setDateTo] = useState("dd/mm/yyyy");
  const [selectedAmount, setSelectedAmount] = useState("Amount 0");
  const [selectedUnassigned, setSelectedUnassigned] = useState("Unassigned 0");
  const [selectedPreOrder, setSelectedPreOrder] = useState<PreOrder | null>(null);

  const [preOrders] = useState<PreOrder[]>([
    {
      id: "920056d0fv5C",
      client: "yoomi",
      status: "Unassigned",
      scheduledFor: "03/05/2026 13:00",
      route: "44 גרשון אגרון ירושלים → 44 גרשון אגרון ירושלים",
      example: "Order to Yoomi",
      action: "Open in Yoomi B2C",
    },
    {
      id: "2743FbK9EC3B82",
      client: "yoomi",
      status: "Unassigned",
      scheduledFor: "03/05/2026 13:00",
      route: "44 גרשון אגרון ירושלים → 52 דרך חברון ירושלים",
      example: "Order to Yoomi",
      action: "Open in Yoomi B2C",
    },
    {
      id: "9A6da924z34914",
      client: "SHAMKO",
      status: "In Progress",
      scheduledFor: "03/05/2026 13:00",
      route: "44 גרשון אגרון ירושלים → 77 גרשון אגרון ירושלים",
      example: "Order to Yoomi",
      action: "Open in Yoomi B2C",
    },
    {
      id: "Da00f9f7ff2332",
      client: "yoomi",
      status: "Unassigned",
      scheduledFor: "03/05/2026 14:30",
      route: "44 גרשון אגרון ירושלים → 44 דרך חברון ירושלים",
      example: "Order to Yoomi",
      action: "Open in Yoomi B2C",
    },
    {
      id: "2710024047c20",
      client: "Taxi 770",
      status: "Unassigned",
      scheduledFor: "04/05/2026 14:30",
      route: "44 גרשון אגרון ירושלים → 1 דרך יוסף פרוסק ירושלים",
      example: "Order to Yoomi",
      action: "Open in Yoomi B2C",
    },
  ]);

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-6">
          <h2 className="text-3xl text-black mb-2">Pre-Orders</h2>
          <p className="text-gray-700">Bring scheduled rides from Yoomi API</p>
        </div>

        {/* Filters */}
        <GlassCard className="mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-gray-600 text-xs mb-2">FROM</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type="text"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/50 border border-white/70 text-black text-sm focus:outline-none focus:ring-2 focus:ring-red-500/60 backdrop-blur-xl"
                  placeholder="dd/mm/yyyy"
                />
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-gray-600 text-xs mb-2">DATE RANGE</label>
              <input
                type="text"
                className="w-full px-4 py-2 rounded-lg bg-white/50 border border-white/70 text-black text-sm focus:outline-none focus:ring-2 focus:ring-red-500/60 backdrop-blur-xl"
              />
            </div>

            <div className="flex-1">
              <label className="block text-gray-600 text-xs mb-2">TO</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type="text"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/50 border border-white/70 text-black text-sm focus:outline-none focus:ring-2 focus:ring-red-500/60 backdrop-blur-xl"
                  placeholder="dd/mm/yyyy"
                />
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-gray-600 text-xs mb-2">&nbsp;</label>
              <div className="relative">
                <select
                  value={selectedAmount}
                  onChange={(e) => setSelectedAmount(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-white/70 text-black text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-red-500/60 backdrop-blur-xl cursor-pointer"
                >
                  <option>Amount 0</option>
                  <option>Amount 5</option>
                  <option>Amount 10</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-gray-600 text-xs mb-2">&nbsp;</label>
              <div className="relative">
                <select
                  value={selectedUnassigned}
                  onChange={(e) => setSelectedUnassigned(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-white/50 border border-white/70 text-black text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-red-500/60 backdrop-blur-xl cursor-pointer"
                >
                  <option>Unassigned 0</option>
                  <option>Unassigned 5</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
              </div>
            </div>
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
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Example</th>
                  <th className="text-left py-3 px-4 text-gray-600 text-xs uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {preOrders.map((order, index) => (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      onClick={() => setSelectedPreOrder(order)}
                      className="border-b border-gray-200/60 hover:bg-white/40 transition-all duration-200 cursor-pointer"
                    >
                      <td className="py-4 px-4">
                        <span className="text-black text-sm">{order.client}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs ${
                            order.status === "Unassigned"
                              ? "bg-red-100 text-red-700 border border-red-300"
                              : "bg-green-100 text-green-700 border border-green-300"
                          }`}
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
                        <span className="text-gray-700 text-sm">{order.example}</span>
                      </td>
                      <td className="py-4 px-4">
                        <button className="text-blue-600 hover:text-blue-700 text-sm underline">
                          {order.action}
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </GlassCard>

        {/* PreOrder Detail Modal */}
        {selectedPreOrder && (
          <PreOrderDetailModal
            isOpen={!!selectedPreOrder}
            onClose={() => setSelectedPreOrder(null)}
            orderData={{
              date: selectedPreOrder.scheduledFor,
              pickup: selectedPreOrder.route.split(" → ")[0] || "Not provided",
              destination: selectedPreOrder.route.split(" → ")[1] || "Not provided",
              pointA: selectedPreOrder.route.split(" → ")[0] || "Not provided",
              scheduledFor: selectedPreOrder.scheduledFor,
              orderId: selectedPreOrder.id,
            }}
          />
        )}
      </motion.div>
    </div>
  );
}
