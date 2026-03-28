# Tag 9 - Dev2 Anleitung

## Setup

```bash
npm install recharts
```

Recharts ist die einzige neue Abhaengigkeit - der Rest ist standard React.

## Dateistruktur

```text
src/
|- components/
|  |- charts/
|     |- TrendChart.jsx
|- pages/
|  |- Dashboard.jsx
|  |- Insights.jsx
```

## In App.jsx / Router einbinden

```jsx
import Dashboard from "./pages/Dashboard";
import Insights from "./pages/Insights";

<Route path="/dashboard" element={<Dashboard />} />
<Route path="/insights" element={<Insights />} />
```

## Wichtig: API Proxy

Damit `/api/...` Aufrufe an Dev1s Backend gehen, in `vite.config.js` eintragen:

```js
export default {
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
};
```
