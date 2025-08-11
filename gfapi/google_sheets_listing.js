'use strict';

const GfApi = require('./index');
const fs = require('fs');
const path = require('path');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
}

function parseCSV(filename) {
    const csvContent = fs.readFileSync(filename, 'utf8');
    const lines = csvContent.split('\n');
    const items = [];
    const headers = parseCSVLine(lines[0]);
    const headerMap = {};
    headers.forEach((header, index) => {
        headerMap[header.trim().toLowerCase()] = index;
    });
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const columns = parseCSVLine(line);
        const getColumnValue = (colName) => {
            const index = headerMap[colName.toLowerCase()];
            return index !== undefined ? columns[index] : undefined;
        };
        const name = getColumnValue('Name');
        const price = getColumnValue('Price');
        const type = getColumnValue('Type');
        const imageUrl = getColumnValue('Image');
        const category = getColumnValue('Category'); // NEW: Read category column
        
        if (!name || !price || price === '0') continue;
        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum <= 0) continue;
        const finalPhotoUrl = imageUrl?.trim() || 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-B8E0E3C81C03056BA7B86A0B95E06B55-Png/150/150/AvatarHeadshot/Png/noFilter';
        const finalName = name.trim();
        
        // NEW: Handle category and tags logic based on GameFlip research
        let finalCategory = GfApi.CATEGORY.OTHER; // Default fallback for blank
        let finalTags = undefined; // Default no tags
        let finalPlatform = undefined; // Platform field
        
        if (category && category.trim()) {
            const categoryValue = category.trim();
            
            // Map based on actual GameFlip API structure
            const categoryMapping = {
                'grow a garden': { 
                    category: 'INGAME',  // This maps to DIGITAL_INGAME -> "Game Item"
                    tags: ['roblox_game: Grow a Garden'], // Keep the blue tag for Grow a Garden
                    platform: 'GF0000ROBLOX' // Maps to "Roblox" platform
                },
                'roblox': { 
                    category: 'INGAME', 
                    tags: undefined, // No tags at all for just "Roblox"
                    platform: 'GF0000ROBLOX'
                },
                'games': { category: 'GAMES', tags: undefined },
                'console': { category: 'CONSOLE', tags: undefined },
                'accessory': { category: 'ACCESSORIES', tags: undefined }
                // Note: No 'other' mapping - blank category will use default OTHER
            };
            
            const lowerCategory = categoryValue.toLowerCase();
            const mapping = categoryMapping[lowerCategory];
            
            if (mapping && GfApi.CATEGORY[mapping.category]) {
                finalCategory = GfApi.CATEGORY[mapping.category];
                if (mapping.tags && mapping.tags.length > 0) {
                    finalTags = mapping.tags; // Only set tags if they exist and have content
                }
                if (mapping.platform) {
                    finalPlatform = mapping.platform;
                }
            } else {
                // For unknown categories that aren't blank, treat as INGAME Roblox item
                finalCategory = GfApi.CATEGORY.INGAME || GfApi.CATEGORY.OTHER;
                finalTags = undefined; // No tags at all
                finalPlatform = 'GF0000ROBLOX';
            }
        }
        // If category is blank/empty, keep defaults: OTHER category, no platform, no tags
        
        let finalDigitalDeliverable = GfApi.DIGITAL_DELIVERABLE.TRANSFER;
        let finalKind = GfApi.KIND.ITEM;
        const lowerCaseType = (type || '').toLowerCase().trim();
        if (lowerCaseType === 'code') {
            finalDigitalDeliverable = GfApi.DIGITAL_DELIVERABLE.CODE;
            finalKind = GfApi.KIND.CODE;
        }
        items.push({
            name: finalName,
            description: finalName,
            price: Math.round(priceNum * 100),
            category: finalCategory, // UPDATED: Use the determined category
            platform: finalPlatform, // NEW: Platform field
            kind: finalKind,
            digital: true,
            digital_region: 'none',
            digital_deliverable: finalDigitalDeliverable,
            tags: finalTags,
            shipping_within_days: GfApi.SHIPPING_WITHIN_DAYS.ONE,
            expire_in_days: GfApi.EXPIRE_IN_DAYS.THIRTY,
            photo_url: finalPhotoUrl,
            originalRow: i + 1
        });
    }
    return items;
}

async function createGameflipListing(gfapi, item) {
    const query = {
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        platform: item.platform, // NEW: Platform field
        kind: item.kind,
        digital: item.digital,
        digital_region: item.digital_region,
        digital_deliverable: item.digital_deliverable,
        shipping_within_days: item.shipping_within_days,
        expire_in_days: item.expire_in_days,
    };
    if (item.tags) query.tags = item.tags;
    
    const listing = await gfapi.listing_post(query);
    if (item.photo_url) {
        await gfapi.upload_photo(listing.id, item.photo_url, 0);
    }
    await gfapi.listing_status(listing.id, GfApi.LISTING_STATUS.ONSALE);
    return listing;
}

// UPDATED: Added customDelay parameter with default fallback
async function processListings(csvFile, apiKey, apiSecret, onProgress, customDelay = 60000) {
    const DELAY_BETWEEN_REQUESTS = customDelay; // Use the custom delay from UI
    
    onProgress(`🚀 Gameflip Mass Listing System Initialized`);
    if (!fs.existsSync(csvFile)) {
        throw new Error(`CSV file not found at: ${csvFile}`);
    }
    const items = parseCSV(csvFile);
    if (items.length === 0) {
        throw new Error(`No valid items found in CSV file.`);
    }
    onProgress(`\n📦 Found ${items.length} valid items to upload.`);
    const gfapi = new GfApi(apiKey, {
        secret: apiSecret,
        algorithm: "SHA1",
        digits: 6,
        period: 30
    }, {
        logLevel: 'info'
    });
    const results = { success: [], errors: [] };
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
            onProgress(`\n[${i + 1}/${items.length}] Uploading: "${item.name}" (Category: ${item.category})`);
            const listing = await createGameflipListing(gfapi, item);
            results.success.push({ name: item.name, id: listing.id, category: item.category });
            onProgress(`✅ Success! ID: ${listing.id} - $${item.price/100} - Category: ${item.category}`);
        } catch (error) {
            let errorMessage = error.message;
            if (error.response && error.response.data && error.response.data.error) {
                errorMessage = `${error.response.data.error.code}: ${error.response.data.error.message}`;
            }
            onProgress(`❌ FAILED: "${item.name}" - ${errorMessage}`);
            results.errors.push({ name: item.name, error: errorMessage, category: item.category });
        } finally {
            if (i < items.length - 1) {
                onProgress(`...waiting ${DELAY_BETWEEN_REQUESTS / 1000}s before next request.`);
                await sleep(DELAY_BETWEEN_REQUESTS);
            }
        }
    }
    let summary = `\n\n=== 🎉 UPLOAD COMPLETE ===\n✅ Success: ${results.success.length}\n❌ Failed: ${results.errors.length}`;
    if(results.errors.length > 0) {
        summary += `\n\nFailed items:\n` + results.errors.map(e => `  - ${e.name}: ${e.error}`).join('\n');
    }
    onProgress(summary);
    return results;
}

module.exports = { processListings };