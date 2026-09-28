const express = require("express");
const courtRoutes = require("./courtAuto/courtRoutes");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use("/api/court-auto", courtRoutes);

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});

