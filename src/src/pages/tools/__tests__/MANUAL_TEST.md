# Manual Test Procedure for Task 5 Fix

## Objective
Verify that the URL encoding now includes `bm` (batchMode) and `bs` (batchSettings) fields.

## Test Steps

### 1. Start the Dev Server
```bash
cd src
npm run dev
```

### 2. Open the Tool
Navigate to: http://localhost:4321/tools/cocktail-recipe/

### 3. Test Encoding with Batch Mode OFF (default)

**Steps:**
1. Open Browser DevTools (F12)
2. Go to Console tab
3. Add a simple recipe (click "Add" button next to Gin preset)
4. Run in console:
```javascript
// Get the encoded state
const state = getStateForEncoding();
console.log('Encoded state:', state);
console.log('Has bm field?', 'bm' in state);
console.log('bm value:', state.bm);
console.log('Has bs field?', 'bs' in state);
```

**Expected Results:**
- `bm` field should be present and set to `false`
- `bs` field should NOT be present (only included when batch mode is true)
- All other fields (n, i, no, du) should be present

### 4. Test Encoding with Batch Mode ON

**Steps:**
1. In console, enable batch mode:
```javascript
app.batchMode = true;
app.batchSettings = {
    scaleMode: 'servings',
    targetValue: 10,
    dilution: 0.2
};
```
2. Run in console:
```javascript
const state = getStateForEncoding();
console.log('Encoded state:', state);
console.log('Has bm field?', 'bm' in state);
console.log('bm value:', state.bm);
console.log('Has bs field?', 'bs' in state);
console.log('bs object:', state.bs);
```

**Expected Results:**
- `bm` field should be present and set to `true`
- `bs` field should be present with:
  - `sm`: "servings" or "volume"
  - `tv`: target value (number as string)
  - `d`: dilution (decimal, e.g., 0.2)
  - `tu`: target unit (only present if scaleMode is "total")

### 5. Test Shareable Link Generation

**Steps:**
1. Enable batch mode (if not already):
```javascript
app.batchMode = true;
app.batchSettings = {
    scaleMode: 'servings',
    targetValue: 10,
    dilution: 0.2
};
```
2. Click "Copy share link" button
3. Paste the link into a text editor
4. In console, decode the link:
```javascript
// Get the link
const url = buildLink('view');
console.log('Shareable link:', url);

// Extract and decode the state
const urlObj = new URL(url);
const encoded = urlObj.searchParams.get('v');
const decoded = decodeState(encoded);
console.log('Decoded state:', decoded);
console.log('Has bm field?', 'bm' in decoded);
console.log('bm value:', decoded.bm);
console.log('Has bs field?', 'bs' in decoded);
console.log('bs object:', decoded.bs);
```

**Expected Results:**
- The URL should contain a `v=` parameter with compressed state
- Decoding should reveal a state object with `bm: true`
- Decoding should reveal a `bs` object with batch settings

### 6. Test Decoding (Load from URL)

**Steps:**
1. Create a test URL with encoded state (use the link from step 5)
2. Open the URL in a new tab
3. In console, run:
```javascript
console.log('app.batchMode:', app.batchMode);
console.log('app.batchSettings:', app.batchSettings);
```

**Expected Results:**
- `app.batchMode` should match the encoded value (true or false)
- `app.batchSettings` should match the encoded bs object (if batchMode is true)

### 7. Test Backward Compatibility

**Steps:**
1. Create an old-format URL (without bm field):
```javascript
const oldState = {
    n: "Old Cocktail",
    i: [{ e: "🍸", n: "Gin", a: 2, u: "oz", ab: 40 }],
    no: "",
    sm: "total",
    tt: "750",
    tu: "ml",
    sv: "10",
    dm: "stirred",
    cd: "20",
    du: "ml"
};
const encoded = encodeState(oldState);
const oldUrl = window.location.origin + window.location.pathname + '?e=' + encoded;
console.log('Old format URL:', oldUrl);
```
2. Open the old URL in a new tab
3. In console, run:
```javascript
console.log('app.batchMode:', app.batchMode);
console.log('Recipe loaded:', recipe.length > 0);
```

**Expected Results:**
- `app.batchMode` should default to `false` for old links
- Recipe should still load correctly
- UI should work as expected

### 8. Test Different Scale Modes

**Test 8a: Servings Mode**
```javascript
app.batchMode = true;
app.batchSettings = {
    scaleMode: 'servings',
    targetValue: 5,
    dilution: 0.3
};
const state = getStateForEncoding();
console.log('Servings mode state:', state);
// Expected: bs.sm = 'servings', bs.tv = '5', bs.d = 0.3, no bs.tu
```

**Test 8b: Volume Mode**
```javascript
app.batchMode = true;
app.batchSettings = {
    scaleMode: 'volume',
    targetValue: 1000,
    dilution: 0.2
};
const state = getStateForEncoding();
console.log('Volume mode state:', state);
// Expected: bs.sm = 'total', bs.tv = '1000', bs.d = 0.2, bs.tu = 'ml'
```

### 9. Test Different Dilution Values

**Test 9a: No dilution**
```javascript
app.batchMode = true;
app.batchSettings.dilution = 0;
const state = getStateForEncoding();
console.log('No dilution state:', state);
// Expected: bs.d = 0
```

**Test 9b: Custom dilution**
```javascript
app.batchMode = true;
app.batchSettings.dilution = 0.25;
const state = getStateForEncoding();
console.log('Custom dilution state:', state);
// Expected: bs.d = 0.25
```

## Success Criteria

All tests should pass:
1. ✅ `bm` field is always present in encoded state
2. ✅ `bs` field is present only when `bm` is true
3. ✅ `bs` object contains correct `sm`, `tv`, `d` fields
4. ✅ `bs.tu` is present only in volume mode
5. ✅ Decoding restores `app.batchMode` correctly
6. ✅ Decoding restores `app.batchSettings` correctly
7. ✅ Old format URLs still work (backward compatibility)
8. ✅ Shareable links preserve all batch mode settings

## Troubleshooting

### Issue: bm field is undefined
- **Cause:** app.batchMode not being set
- **Fix:** Ensure app.batchMode is initialized in the app state

### Issue: bs field is missing when batchMode is true
- **Cause:** getStateForEncoding() not checking batchMode correctly
- **Fix:** Check that the conditional `if (app.batchMode)` is working

### Issue: Decoding fails for old URLs
- **Cause:** Backward compatibility logic not working
- **Fix:** Ensure the `else` branch in decodeStateToApp() handles old format

### Issue: Dilution value is incorrect
- **Cause:** getDilutionPct() returning wrong value
- **Fix:** Check dilution mode and custom dilution value are being read correctly

## Notes

- The encoding uses LZ-String compression, so the actual URL parameter will be compressed
- Use `decodeState()` to decompress and inspect the encoded state
- The test file `url-encoding.test.js` contains helper functions for testing
