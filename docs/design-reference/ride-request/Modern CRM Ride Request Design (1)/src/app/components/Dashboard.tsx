import { useState } from "react";
import { motion } from "motion/react";
import { Calendar, ChevronDown, TrendingUp, TrendingDown } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export function Dashboard() {
  const [filterDate, setFilterDate] = useState("03/05/2026");
  const [filterClient, setFilterClient] = useState("All clients");
  const [filterStatus, setFilterStatus] = useState("All statuses");
  const [filterArea, setFilterArea] = useState("Date Desc");

  const completedRequestData = [
    { id: "req-jan", name: "Jan", value: 80 },
    { id: "req-feb", name: "Feb", value: 95 },
    { id: "req-mar", name: "Mar", value: 110 },
    { id: "req-apr", name: "Apr", value: 105 },
    { id: "req-may", name: "May", value: 90 },
  ];

  const tripData = [
    { id: "trip-jan", name: "Jan", value: 70 },
    { id: "trip-feb", name: "Feb", value: 85 },
    { id: "trip-mar", name: "Mar", value: 95 },
    { id: "trip-apr", name: "Apr", value: 110 },
    { id: "trip-may", name: "May", value: 95 },
  ];

  const avgTripData = [
    { id: "avg-jan", name: "Jan", value: 65 },
    { id: "avg-feb", name: "Feb", value: 70 },
    { id: "avg-mar", name: "Mar", value: 68 },
    { id: "avg-apr", name: "Apr", value: 72 },
    { id: "avg-may", name: "May", value: 65 },
  ];

  const completedToRequestData = [
    { id: "comp-jan", name: "Jan", value: 75 },
    { id: "comp-feb", name: "Feb", value: 80 },
    { id: "comp-mar", name: "Mar", value: 85 },
    { id: "comp-apr", name: "Apr", value: 90 },
    { id: "comp-may", name: "May", value: 85 },
  ];

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-6">
          <h2 className="text-3xl text-black mb-2">Operations</h2>
          <p className="text-gray-700">B-orders analytics</p>
        </div>

        {/* Filters */}
        <GlassCard className="mb-6">
          <div className="flex items-center gap-4">
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
                  <option>Tech Corp</option>
                  <option>Global Solutions</option>
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
                  <option>In Progress</option>
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
                  <option>Date Desc</option>
                  <option>Date Asc</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <GlassCard>
              <p className="text-gray-600 text-xs mb-1">TOTAL API-CREATED ORDERS</p>
              <p className="text-2xl text-black">156</p>
            </GlassCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <GlassCard>
              <p className="text-gray-600 text-xs mb-1">COMPLETED REQUESTS</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl text-black">142</p>
                <div className="flex items-center text-green-600 text-xs">
                  <TrendingUp className="w-3 h-3" />
                  <span>+12%</span>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <GlassCard>
              <p className="text-gray-600 text-xs mb-1">AVG TRIP DURATION</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl text-black">24m</p>
                <div className="flex items-center text-red-600 text-xs">
                  <TrendingDown className="w-3 h-3" />
                  <span>-5%</span>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <GlassCard>
              <p className="text-gray-600 text-xs mb-1">REVENUE</p>
              <p className="text-2xl text-black">₪42,500</p>
            </GlassCard>
          </motion.div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Chart 1 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <GlassCard>
              <div className="mb-4">
                <h3 className="text-black mb-1">Requests</h3>
                <p className="text-xs text-gray-600">
                  B-order is current period detailed + previous period
                </p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={completedRequestData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </GlassCard>
          </motion.div>

          {/* Chart 2 */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <GlassCard>
              <div className="mb-4">
                <h3 className="text-black mb-1">Trips</h3>
                <p className="text-xs text-gray-600">Successful + unsuccessful trips</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={tripData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </GlassCard>
          </motion.div>

          {/* Chart 3 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <GlassCard>
              <div className="mb-4">
                <h3 className="text-black mb-1">Avg Trip Duration</h3>
                <p className="text-xs text-gray-600">
                  B-order is current period detailed + previous period
                </p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={avgTripData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>
          </motion.div>

          {/* Chart 4 */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <GlassCard>
              <div className="mb-4">
                <h3 className="text-black mb-1">Completed to Request</h3>
                <p className="text-xs text-gray-600">
                  B-order is current period detailed + previous period
                </p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={completedToRequestData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} dot={{ fill: "#ef4444" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </GlassCard>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
