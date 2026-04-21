const mongoose = require("mongoose");
const { randomUUID } = require("crypto");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchFilter(fields, search) {
  if (!search) {
    return {};
  }

  return {
    $or: fields.map((field) => ({
      [field]: { $regex: escapeRegex(search), $options: "i" },
    })),
  };
}

function withBaseSchema(definition, options = {}) {
  const schema = new mongoose.Schema(
    {
      _id: {
        type: String,
        default: () => randomUUID(),
      },
      ...definition,
    },
    {
      timestamps: true,
      ...options,
    },
  );

  schema.virtual("id").get(function getId() {
    return this._id;
  });

  schema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    },
  });

  schema.set("toObject", {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    },
  });

  schema.method("update", async function update(payload) {
    Object.assign(this, payload);
    await this.save();
    return this;
  });

  schema.method("destroy", async function destroy() {
    await this.deleteOne();
    return this;
  });

  schema.method("reload", async function reload() {
    return this.constructor.findByPk(this.id);
  });

  schema.statics.findByPk = function findByPk(id) {
    return this.findById(id);
  };

  schema.statics.findAll = function findAll(options = {}) {
    const query = this.find(options.filter || {});

    if (options.sort) {
      query.sort(options.sort);
    }

    if (typeof options.limit === "number") {
      query.limit(options.limit);
    }

    if (typeof options.skip === "number") {
      query.skip(options.skip);
    }

    if (options.populate) {
      query.populate(options.populate);
    }

    return query.exec();
  };

  schema.statics.findAndCountAll = async function findAndCountAll(options = {}) {
    const filter = options.filter || {};
    const [count, rows] = await Promise.all([
      this.countDocuments(filter),
      this.findAll(options),
    ]);

    return { count, rows };
  };

  schema.statics.bulkCreate = function bulkCreate(items) {
    return this.insertMany(items);
  };

  return schema;
}

module.exports = {
  buildSearchFilter,
  withBaseSchema,
};
