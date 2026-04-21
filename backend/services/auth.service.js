const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { matchedData } = require("express-validator");
const env = require("../config/env");
const { User, Company, Setting } = require("../models");

class AuthService {
  static async signup(req) {
    const payload = matchedData(req, { locations: ["body"] });

    const existingUser = await User.scope("withPassword").findOne({ email: payload.email });
    if (existingUser) {
      const error = new Error("Email already exists");
      error.status = 409;
      throw error;
    }

    let companyId = null;

    if (payload.companyName) {
      const company = await Company.create({
        name: payload.companyName,
        industry: payload.industry || "General",
        headquarters: payload.headquarters || "Remote",
        carbonTargetYear: 2040,
        carbonPricePerTon: env.carbonPricePerTon,
        apiKey: `cf_${Date.now()}`,
        status: "TRIAL",
      });

      companyId = company.id;

      await Setting.create({
        companyId: company.id,
        companyName: company.name,
        industry: company.industry,
        carbonPricePerTon: Number(company.carbonPricePerTon),
        netZeroTargetYear: company.carbonTargetYear,
        integrations: [],
        apiKeys: [{ label: "Default API Key", key: company.apiKey, createdAt: new Date().toISOString() }],
      });
    }

    const password = await bcrypt.hash(payload.password, env.auth.bcryptSaltRounds);
    const user = await User.create({
      companyId,
      name: payload.name,
      email: payload.email,
      password,
      role: payload.role || "USER",
    });

    return this.buildAuthResponse(user);
  }

  static async login(req) {
    const payload = matchedData(req, { locations: ["body"] });
    const user = await User.scope("withPassword").findOne({ email: payload.email });

    if (!user) {
      const error = new Error("Invalid email or password");
      error.status = 401;
      throw error;
    }

    const isPasswordValid = await bcrypt.compare(payload.password, user.password);
    if (!isPasswordValid) {
      const error = new Error("Invalid email or password");
      error.status = 401;
      throw error;
    }

    user.lastLoginAt = new Date();
    await user.save();

    return this.buildAuthResponse(user);
  }

  static buildAuthResponse(user) {
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role, companyId: user.companyId || null },
      env.auth.jwtSecret,
      { expiresIn: env.auth.jwtExpiresIn },
    );

    return { token, user: safeUser };
  }
}

module.exports = AuthService;
