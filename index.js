"use strict";

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const textChunk = require("png-chunk-text");
const encodeChunks = require("png-chunks-encode");
const extractChunks = require("png-chunks-extract");

// Simple CLI arg parsing
function parseArgs(argv) {
	const args = { input: null, outDir: null, overwrite: false, forceVersion: null };
	const positional = [];
	for (let i = 2; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === "-h" || token === "--help") {
			args.help = true;
			continue;
		}
		if ((token === "-i" || token === "--input") && argv[i + 1]) {
			args.input = argv[i + 1];
			i += 1;
			continue;
		}
		if ((token === "-o" || token === "--out") && argv[i + 1]) {
			args.outDir = argv[i + 1];
			i += 1;
			continue;
		}
		if ((token === "-v" || token === "--force-version") && argv[i + 1]) {
			args.forceVersion = argv[i + 1];
			i += 1;
			continue;
		}
		if (token === "--overwrite" || token === "overwrite") {
			args.overwrite = true;
			continue;
		}
		if (!token.startsWith("-")) {
			positional.push(token);
		}
	}
	if (!args.input && positional.length > 0) {
		args.input = positional[0];
	}
	if (!args.outDir && positional.length > 1) {
		args.outDir = positional[1];
	}
	if (!args.forceVersion && positional.length > 2) {
		args.forceVersion = positional[2];
	}
	return args;
}

function printHelp() {
	const help = [
		"Usage:",
		"  node index.js --input <path-to-spine.json> [--out <images-dir>] [--overwrite] [--force-version <ver>]",
		"  node index.js <path-to-spine.json> [<images-dir>] [overwrite] [<force-version>]",
		"",
		"Options:",
		"  -i, --input       Path to the Spine JSON file",
		"  -o, --out         Output images directory (defaults to skeleton.images or ./images)",
		"      --overwrite   Overwrite existing images",
		"  -v, --force-version <ver>  Override skeleton.spine version in generated JSON (e.g. 4.3.39-beta)",
		"  -h, --help        Show this help",
	].join("\n");
	console.log(help);
}

function ensureDirectoryExists(directoryPath) {
	if (!fs.existsSync(directoryPath)) {
		fs.mkdirSync(directoryPath, { recursive: true });
	}
}

function clearImagesDirectory(imagesDirPath) {
	try {
		const entries = fs.readdirSync(imagesDirPath, { withFileTypes: true });
		let removed = 0;
		for (const entry of entries) {
			if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase();
				if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
					try {
						fs.unlinkSync(path.join(imagesDirPath, entry.name));
						removed += 1;
					} catch (_) {
						// ignore and continue
					}
				}
			}
		}
		if (removed > 0) {
			console.log(`Cleared ${removed} existing image(s) from: ${imagesDirPath}`);
		}
	} catch (err) {
		console.warn(`Could not clear images directory '${imagesDirPath}': ${err.message}`);
	}
}

function fileExists(filePath) {
	try {
		fs.accessSync(filePath, fs.constants.F_OK);
		return true;
	} catch (_) {
		return false;
	}
}

function sanitizeFilename(name) {
	// Replace reserved/invalid characters on Windows and POSIX
	return name.replace(/[<>:"/\\|?*]/g, "_");
}

function createOnePixelPng(filePath, metadataObject) {
	return new Promise((resolve, reject) => {
		const png = new PNG({ width: 1, height: 1, colorType: 6 }); // RGBA
		png.data[0] = 255;
		png.data[1] = 255;
		png.data[2] = 255;
		png.data[3] = 255;

		const chunks = [];
		// PNG signature is implicit in encoder
		// Build IHDR via pngjs serialization to buffer, then augment with text
		png.pack();
		const buffers = [];
		png.on("data", (d) => buffers.push(d));
		png.on("error", reject);
		png.on("end", () => {
			try {
				const pngBuffer = Buffer.concat(buffers);
				const existingChunks = extractChunks(pngBuffer);
				const outChunks = [];
				let injected = false;
				for (const ch of existingChunks) {
					outChunks.push(ch);
					if (!injected && ch.name === "IHDR" && metadataObject) {
						const tChunk = textChunk.encode("spine_data", JSON.stringify(metadataObject));
						outChunks.push(tChunk);
						injected = true;
					}
				}
				const finalPng = Buffer.from(encodeChunks(outChunks));
				fs.writeFile(filePath, finalPng, (err) => {
					if (err) return reject(err);
					resolve();
				});
			} catch (e) {
				reject(e);
			}
		});
	});
}

function createBlankPng(filePath, width, height, metadataObject) {
	return new Promise((resolve, reject) => {
		const w = Math.max(1, Number(width) || 1);
		const h = Math.max(1, Number(height) || 1);
		const png = new PNG({ width: w, height: h, colorType: 6 });
		for (let y = 0; y < h; y += 1) {
			for (let x = 0; x < w; x += 1) {
				const idx = (w * y + x) << 2;
				png.data[idx] = 255;
				png.data[idx + 1] = 255;
				png.data[idx + 2] = 255;
				png.data[idx + 3] = 255;
			}
		}

		png.pack();
		const buffers = [];
		png.on("data", (d) => buffers.push(d));
		png.on("error", reject);
		png.on("end", () => {
			try {
				const pngBuffer = Buffer.concat(buffers);
				const existingChunks = extractChunks(pngBuffer);
				const outChunks = [];
				let injected = false;
				for (const ch of existingChunks) {
					outChunks.push(ch);
					if (!injected && ch.name === "IHDR" && metadataObject) {
						const tChunk = textChunk.encode("spine_data", JSON.stringify(metadataObject));
						outChunks.push(tChunk);
						injected = true;
					}
				}
				const finalPng = Buffer.from(encodeChunks(outChunks));
				fs.writeFile(filePath, finalPng, (err) => {
					if (err) return reject(err);
					resolve();
				});
			} catch (e) {
				reject(e);
			}
		});
	});
}

function createImageFromTemplate(templatePath, outPath, metadataObject) {
	return new Promise((resolve, reject) => {
		fs.readFile(templatePath, (readErr, templateBuffer) => {
			if (readErr) return reject(readErr);
			try {
				const chunks = extractChunks(templateBuffer);
				const outChunks = [];
				let injected = false;
				for (const ch of chunks) {
					outChunks.push(ch);
					if (!injected && ch.name === "IHDR" && metadataObject) {
						const tChunk = textChunk.encode("spine_data", JSON.stringify(metadataObject));
						outChunks.push(tChunk);
						injected = true;
					}
				}
				const finalPng = Buffer.from(encodeChunks(outChunks));
				fs.writeFile(outPath, finalPng, (writeErr) => {
					if (writeErr) return reject(writeErr);
					resolve();
				});
			} catch (e) {
				return reject(e);
			}
		});
	});
}

function collectAttachmentNames(spineJson) {
	const names = new Set();
	if (!spineJson || !spineJson.skins) return [];
	const skins = spineJson.skins;
	if (Array.isArray(skins)) {
		for (const skin of skins) {
			const attachmentsRoot = skin.attachments || skin;
			for (const slotName in attachmentsRoot) {
				const slot = attachmentsRoot[slotName];
				for (const attachmentName in slot) {
					names.add(attachmentName);
				}
			}
		}
	} else {
		for (const skinName in skins) {
			const skin = skins[skinName];
			for (const slotName in skin) {
				const slot = skin[slotName];
				for (const attachmentName in slot) {
					names.add(attachmentName);
				}
			}
		}
	}
	return Array.from(names);
}

function shouldPreserveAttachmentObject(attachmentObject) {
	if (!attachmentObject || typeof attachmentObject !== "object") return false;
	const preserveKeys = new Set([
		"type",
		"lengths",
		"vertexCount",
		"vertices",
		"uvs",
		"triangles",
		"hull",
		"edges",
		"weights",
		"path",
		"end",
		"closed",
		"constantSpeed",
		"color",
		"Path_Portrait",
		"Path",
		"Mask"
	]);
	for (const key of Object.keys(attachmentObject)) {
		if (preserveKeys.has(key)) return true;
	}
	return false;
}

// Provided by user; kept intact except minimal safety defaults
function extractMinimalSpineStructure(spineJson) {
	const result = {};
 
    // Extract skeleton
    if (spineJson.skeleton) {
        result.skeleton = {
            hash: spineJson.skeleton.hash || "ANDAzG2KBFVqeVmU+LDx0cn5rt0",
            spine: spineJson.skeleton.spine || "3.7.94",
            width: spineJson.skeleton.width || 0,
            height: spineJson.skeleton.height || 0,
            images: spineJson.skeleton.images || "./images/",
            audio: spineJson.skeleton.audio || ""
        };

		if(result.skeleton.images) {
			result.skeleton.images ="./images/";
		}
    }
 
    // Extract bones (only name and parent)
    if (Array.isArray(spineJson.bones)) {
        result.bones = spineJson.bones.map(bone => {
            const boneObj = { name: bone.name };
            if (bone.parent) boneObj.parent = bone.parent;
            return boneObj;
        });
    }
 
    // Extract slots (only name and bone)
    if (Array.isArray(spineJson.slots)) {
        result.slots = spineJson.slots.map(slot => ({
            name: slot.name,
            bone: slot.bone
        }));
    }

	result.transform = spineJson?.transform;
	result.path = spineJson?.path; 
	
    // Extract skins: copy path/mesh/clipping-like attachments as-is; keep region attachments minimal (width/height)
    if (spineJson.skins && spineJson.skins.default) {
        result.skins = { default: {} };
        for (const slotName in spineJson.skins.default) {
            result.skins.default[slotName] = {};
            const slot = spineJson.skins.default[slotName];
            for (const attachmentName in slot) {
                const attachment = slot[attachmentName];
                if (shouldPreserveAttachmentObject(attachment)) {
                    // Keep full attachment data for complex types (path/mesh/clipping, etc.)
                    result.skins.default[slotName][attachmentName] = attachment;
                } else {
                    // Minimal info for simple region attachments
                    result.skins.default[slotName][attachmentName] = {
                        width: attachment.width || 0,
                        height: attachment.height || 0
                    };
                }
            }
        }
    }

	result.animations = spineJson?.animations;
	result.events = spineJson?.events;
 
    // Extract animations (only animation names, slots, and slot names, no data)
    // if (spineJson.animations) {
    //     result.animations = {};
    //     for (const animName in spineJson.animations) {
    //         const anim = spineJson.animations[animName];
    //         result.animations[animName] = { slots: {} };
    //         if (anim.slots) {
    //             for (const slotName in anim.slots) {
    //                 result.animations[animName].slots[slotName] = {};
    //             }
    //         }
    //     }
    // }

	// if(spineJson.events) {
	// 	result.events = spineJson.events;
	// }
 
    return result;
}

async function main() {
	const args = parseArgs(process.argv);
	if (args.help || !args.input) {
		printHelp();
		if (!args.input) return;
	}

	const inputPath = path.resolve(process.cwd(), args.input);
	if (!fs.existsSync(inputPath)) {
		console.error(`Input file not found: ${inputPath}`);
		process.exit(1);
	}

	let spineJson;
	try {
		const raw = fs.readFileSync(inputPath, "utf8");
		spineJson = JSON.parse(raw);
	} catch (err) {
		console.error("Failed to read/parse JSON:", err.message);
		process.exit(1);
	}

	// Prepare output JSON (preserve full content to keep animations exact)
	const outputJson = extractMinimalSpineStructure(spineJson);
	// const outputJson = JSON.parse(JSON.stringify(spineJson));


	// Resolve images directory
	const imagesField = args.outDir || (spineJson.skeleton && spineJson.skeleton.images) || "./images/";
	const normalizedImagesField = imagesField.replace(/\\/g, "/");
	const imagesDir = path.resolve(path.dirname(inputPath), normalizedImagesField);
	ensureDirectoryExists(imagesDir);
	// Clear existing images first as requested
	clearImagesDirectory(imagesDir);

	// Resolve template one-pixel image
	const defaultTemplate = path.resolve(process.cwd(), "./dummyPixel/dummyOnePixel.png");
	const templatePath = fileExists(defaultTemplate) ? defaultTemplate : null;

	const attachmentNames = collectAttachmentNames(spineJson);
	if (attachmentNames.length === 0) {
		console.warn("No attachment names found in skins.");
	}

	let created = 0;
	let skipped = 0;

	// Find width/height for a given attachment name from skins
	function findAttachmentSize(json, name) {
		if (!json || !json.skins) return { width: 0, height: 0 };
		const scanAttachmentsRoot = (attachmentsRoot) => {
			for (const slotName in attachmentsRoot) {
				const slot = attachmentsRoot[slotName];
				for (const attName in slot) {
					if (attName === name) {
						const att = slot[attName];
						const w = Number(att.width) || 0;
						const h = Number(att.height) || 0;
						if (w > 0 && h > 0) return { width: w, height: h };
					}
				}
			}
			return null;
		};
		if (Array.isArray(json.skins)) {
			for (const skin of json.skins) {
				const attachmentsRoot = skin.attachments || skin;
				const res = scanAttachmentsRoot(attachmentsRoot);
				if (res) return res;
			}
		} else {
			for (const skinName in json.skins) {
				const res = scanAttachmentsRoot(json.skins[skinName]);
				if (res) return res;
			}
		}
		return { width: 0, height: 0 };
	}

	for (const attachmentName of attachmentNames) {
		if (!attachmentName) continue;
		const safeName = sanitizeFilename(attachmentName);
		const outPath = path.join(imagesDir, `${safeName}.png`);

		if (fs.existsSync(outPath) && !args.overwrite) {
			skipped += 1;
			continue;
		}

		try {
			const size = findAttachmentSize(spineJson, attachmentName);
			const w = size.width > 0 ? size.width : 2;
			const h = size.height > 0 ? size.height : 2;
			await createBlankPng(outPath, w, h);
			created += 1;
		} catch (err) {
			console.error(`Failed creating image for attachment '${attachmentName}':`, err.message);
		}
	}

	console.log(`Images directory: ${imagesDir}`);
	console.log(`Attachments processed: ${attachmentNames.length}, created: ${created}, skipped (exists): ${skipped}`);

	// Write generated spine JSON next to input
	const outputPath = path.join(path.dirname(inputPath), "generated_spine.json");
	try {
		if (!outputJson.skeleton) outputJson.skeleton = {};
		if (args.forceVersion) {
			outputJson.skeleton.spine = String(args.forceVersion);
		}
		// Point images to selected output directory if provided
		if (args.outDir) {
			let imagesFieldOut = normalizedImagesField;
			if (!imagesFieldOut.endsWith("/")) imagesFieldOut += "/";
			outputJson.skeleton.images = imagesFieldOut;
		}
		fs.writeFileSync(outputPath, JSON.stringify(outputJson, null, 2), "utf8");
		console.log(`Generated spine written to: ${outputPath}`);
	} catch (err) {
		console.warn("Could not write minimal structure file:", err.message);
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});


