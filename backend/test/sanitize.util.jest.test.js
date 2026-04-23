const { sanitizeValue } = require("../utils/sanitize");

describe("sanitize utilities", () => {
  test("removes mongo-operator keys from nested payloads", () => {
    const payload = {
      name: "safe",
      $where: "malicious()",
      profile: {
        "meta.isAdmin": true,
        city: "Karachi",
      },
    };

    expect(sanitizeValue(payload)).toEqual({
      name: "safe",
      profile: {
        city: "Karachi",
      },
    });
  });

  test("strips script tags and angle brackets from strings", () => {
    const payload = {
      notes: "<script>alert('x')</script><b>safe</b>",
    };

    expect(sanitizeValue(payload)).toEqual({
      notes: "bsafe/b",
    });
  });
});
