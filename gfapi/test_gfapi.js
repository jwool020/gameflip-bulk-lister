// test_gfapi.js
const GfApi = require('./index');

try {
    console.log("Attempting to access GfApi.DIGITAL_DELIVERABLE.TRANSFER:");
    console.log(GfApi.DIGITAL_DELIVERABLE.TRANSFER);
    console.log("\nAttempting to access GfApi.CATEGORY.INGAME:");
    console.log(GfApi.CATEGORY.INGAME);
    console.log("\nAttempting to access GfApi.LISTING_STATUS.ONSALE:");
    console.log(GfApi.LISTING_STATUS.ONSALE);

    // You'll need valid API keys to instantiate it, but we can test the properties first
    // const gfapiInstance = new GfApi("test-123", { secret: "ABCDEF" });
    // console.log("GfApi instance created successfully.");

} catch (e) {
    console.error("Error accessing GfApi properties:", e.message);
    console.error(e.stack);
}