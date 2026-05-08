import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { RequestRides } from "./components/RequestRides";
import { PreOrders } from "./components/PreOrders";
import { Orders } from "./components/Orders";
import { Communications } from "./components/Communications";
import { PriceCalculator } from "./components/PriceCalculator";
import { Dashboard } from "./components/Dashboard";
import { AccessManagement } from "./components/AccessManagement";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: RequestRides },
      { path: "pre-orders", Component: PreOrders },
      { path: "orders", Component: Orders },
      { path: "communications", Component: Communications },
      { path: "price-calculator", Component: PriceCalculator },
      { path: "dashboard", Component: Dashboard },
      { path: "access-management", Component: AccessManagement },
    ],
  },
]);
