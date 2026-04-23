process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/carbonflow_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
