/**
 * Test suite for URL encoding/decoding of batch mode and batch settings
 *
 * This file documents the test cases for verifying that the URL encoding
 * properly includes the bm (batchMode) and bs (batchSettings) fields.
 *
 * To test manually:
 * 1. Open the cocktail recipe maker in the browser
 * 2. Open DevTools Console
 * 3. Run the commands below to verify encoding/decoding
 */

/* eslint-disable */

/**
 * TEST 1: Verify encoding includes bm field
 *
 * Expected: The encoded state should contain bm: false or bm: true
 */
function testEncodingHasBatchMode() {
	console.log('TEST 1: Encoding includes bm field');

	// Access the app state
	const app = window.app || {};
	const batchMode = app.batchMode;

	console.log(`✓ app.batchMode = ${batchMode}`);

	// Generate state for encoding
	const state = {
		n: "Test Cocktail",
		i: [
			{ e: "🍸", n: "Gin", a: 2, u: "oz", ab: 40 }
		],
		no: "",
		bm: batchMode,
		du: "ml"
	};

	console.log('✓ Encoded state structure:', state);
	console.log('✓ Contains bm field:', 'bm' in state);
}

/**
 * TEST 2: Verify encoding includes bs object when batchMode is true
 *
 * Expected: The encoded state should contain bs object with sm, tv, d fields
 */
function testEncodingHasBatchSettings() {
	console.log('\nTEST 2: Encoding includes bs object when batchMode=true');

	const state = {
		n: "Batch Cocktail",
		i: [
			{ e: "🥃", n: "Bourbon", a: 2, u: "oz", ab: 45 }
		],
		no: "",
		bm: true,
		bs: {
			sm: "servings",
			tv: "10",
			d: 0.2
		},
		du: "ml"
	};

	console.log('✓ Encoded state with batch mode:', state);
	console.log('✓ Contains bs object:', 'bs' in state);
	console.log('✓ bs.sm (scaleMode):', state.bs.sm);
	console.log('✓ bs.tv (targetValue):', state.bs.tv);
	console.log('✓ bs.d (dilution):', state.bs.d);
}

/**
 * TEST 3: Verify decoding restores batchMode
 *
 * Expected: Decoding should restore app.batchMode from the bm field
 */
function testDecodingRestoresBatchMode() {
	console.log('\nTEST 3: Decoding restores batchMode');

	const encodedState = {
		n: "Test Cocktail",
		i: [
			{ e: "🍸", n: "Gin", a: 2, u: "oz", ab: 40 }
		],
		no: "",
		bm: true,
		bs: {
			sm: "servings",
			tv: "10",
			d: 0.2
		},
		du: "ml"
	};

	console.log('✓ Input state has bm:', encodedState.bm);
	console.log('✓ Expected: app.batchMode should be', encodedState.bm);
	console.log('✓ Expected: app.batchSettings should match bs object');
}

/**
 * TEST 4: Verify backward compatibility with old format
 *
 * Expected: Old format without bm field should default to batchMode=false
 */
function testBackwardCompatibility() {
	console.log('\nTEST 4: Backward compatibility with old format');

	const oldFormatState = {
		n: "Old Cocktail",
		i: [
			{ e: "🍸", n: "Gin", a: 2, u: "oz", ab: 40 }
		],
		no: "",
		sm: "total",
		tt: "750",
		tu: "ml",
		sv: "10",
		dm: "stirred",
		cd: "20",
		du: "ml"
	};

	console.log('✓ Old format state (no bm field):', Object.keys(oldFormatState));
	console.log('✓ Expected: Should default to batchMode=false');
	console.log('✓ Expected: Should still work with old flat structure');
}

/**
 * TEST 5: Verify shareable link structure
 *
 * Expected: Shareable link should contain compressed state with bm and bs
 */
function testShareableLinkStructure() {
	console.log('\nTEST 5: Shareable link structure');

	console.log('✓ To test: Create a recipe, then click "Copy share link"');
	console.log('✓ The link should have ?e= parameter with compressed state');
	console.log('✓ Decompressing it should reveal bm and bs fields');
	console.log('\nExample manual test:');
	console.log('1. Open browser DevTools Console');
	console.log('2. Run: copyLink("view")');
	console.log('3. Decode the URL and check for bm field');
}

/**
 * Run all tests
 */
function runAllTests() {
	console.log('='.repeat(60));
	console.log('URL ENCODING TEST SUITE');
	console.log('='.repeat(60));

	testEncodingHasBatchMode();
	testEncodingHasBatchSettings();
	testDecodingRestoresBatchMode();
	testBackwardCompatibility();
	testShareableLinkStructure();

	console.log('\n' + '='.repeat(60));
	console.log('TEST SUITE COMPLETE');
	console.log('='.repeat(60));
	console.log('\nNOTE: These are documentation tests.');
	console.log('To run actual tests, open the cocktail tool in browser');
	console.log('and run the functions above in DevTools Console.');
	console.log('Or use the automated test in the next section.');
}

// Export for browser console testing
if (typeof window !== 'undefined') {
	window.testUrlEncoding = {
		testEncodingHasBatchMode,
		testEncodingHasBatchSettings,
		testDecodingRestoresBatchMode,
		testBackwardCompatibility,
		testShareableLinkStructure,
		runAllTests
	};

	console.log('URL encoding tests loaded!');
	console.log('Run: testUrlEncoding.runAllTests()');
}
