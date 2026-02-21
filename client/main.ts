import { Buffer } from "buffer";
import { ElfFile } from './elf';
import { DOSBoxApi } from "./api"
import { load } from "./loader"
import { parseSDA, parsePSP, parseEnv } from "./util"
import * as b from '@pretendonetwork/binary-parser';
import { Mailbox } from "./mailbox";

export * from './hook_demo_app';

// https://github.com/PretendoNetwork/binary-parser/issues/5 🤦‍♂️
if (typeof SharedArrayBuffer == "undefined") {
	(window as any).SharedArrayBuffer = class {};
}

const keystone = new ks.Keystone(ks.ARCH_X86, ks.MODE_16);
keystone.option(ks.OPT_SYNTAX, ks.OPT_SYNTAX_NASM);
const capstone = new cs.Capstone(cs.ARCH_X86, cs.MODE_16);

// Random data with no meaning, just to find a previously allocated area again
const MARKER = Buffer.from("ad661bfa9cc5dd15af0f5a4ffcf6e255", "hex");
const MARKER_STACK = Buffer.from("2e1315ee7e885f5741163fd0761930df ", "hex");

const LOW_MEM_SIZE = 1024;
const LOW_MEM_SCRATCH_SIZE = 1024;
const XMS_SCRATCH_SIZE = 32 * 1024;
const XMS_MAILBOX_SIZE = 32 * 1024;

export const api = new DOSBoxApi();

// FIXME: this needs to be wrapped in some more useful class, especially to get rid of the different size multipliers
const lowMemHeader = new b.Parser()
	.endianness('little')
	.array('marker', { type: 'uint8', length: 16 })
	.uint16('lowMemScratchAddrBlocks')
	.uint16('lowMemScratchSizeBlocks')
	.uint16('xmsCodeAddrPages')
	.uint16('xmsCodeSizePages')
	.uint16('xmsDataAddrPages')
	.uint16('xmsDataSizePages')
	.uint16('xmsScratchAddrPages')
	.uint16('xmsScratchSizePages')
	.uint16('xmsMailboxAddrPages')
	.uint16('xmsMailboxSizePages');

export type MemoryAllocations = b.infer<typeof lowMemHeader>

async function fetchFile(fileName: string) {
	const response = await fetch(fileName, {cache: 'no-store'});
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}
	return new Buffer(await response.arrayBuffer());
}

function asm(code: string, offset?: number): Uint8Array {
	try {
		return keystone.asm(code, offset);
	} catch(err) {
		throw Error(`${err} while assembling ${code}`);
	}
}

function disasm(code: Buffer, offset?: number, max?: number) {
	try {
		return capstone.disasm(code, offset, max);
	} catch (err) {
		if (typeof(err) == "string" && err.indexOf("failed with code 0:") >= 0) {
			return [];
		} else {
			throw err;
		}
	}
}

async function maybeAllocXmsMem(meta: MemoryAllocations, addrField: string, sizeField: string, size: number) {
	if (meta[addrField] < 0x110 || meta[sizeField] < size / 4096) {
		const sizePages = Math.ceil(size / 4096);
		const addr = (await api.alloc(sizePages * 4096, 'XMS')).addr;
		meta[addrField] = addr / 4096;
		meta[sizeField] = sizePages;
		console.log(`Allocated ${sizePages * 4} KiB at 0x${addr.toString(16)}`);
	} else {
		console.log(`Re-using existing allocation of ${meta[sizeField] * 4} KiB at 0x${(meta[addrField] * 4096).toString(16)}`);
	}
}

// FIXME: there should be some class that handles the state of this control block
export let MetaAddr;

async function prepMemory(lowMem: Buffer, codeSize: number, dataSize: number): Promise<MemoryAllocations> {
	let lowMemAddr = lowMem.indexOf(MARKER);
	let meta: MemoryAllocations;
	if (lowMemAddr > 0) {
		meta = lowMemHeader.parse(lowMem.slice(lowMemAddr));
	} else {
		lowMemAddr = (await api.alloc(LOW_MEM_SIZE, "UMA")).addr
		meta = lowMemHeader.parse(new Buffer(lowMemHeader.size()));
		meta.marker = [...MARKER];
	}
	console.log(`Metadata memory at 0x${lowMemAddr.toString(16)}`);
	if (meta.lowMemScratchAddrBlocks < 0x10 || meta.lowMemScratchSizeBlocks < 16) {
		meta.lowMemScratchAddrBlocks = (await api.alloc(LOW_MEM_SCRATCH_SIZE, 'UMA')).addr / 16;
		meta.lowMemScratchSizeBlocks = LOW_MEM_SCRATCH_SIZE / 16;
		console.log(`Allocated ${meta.lowMemScratchSizeBlocks * 16 / 1024} KiB at 0x${(meta.lowMemScratchAddrBlocks * 16).toString(16)}`);
	} else {
		console.log(`Re-using existing allocation of ${meta.lowMemScratchSizeBlocks * 16 / 1024} KiB at 0x${(meta.lowMemScratchAddrBlocks * 16).toString(16)}`);
	}
	await maybeAllocXmsMem(meta, "xmsMailboxAddrPages", "xmsMailboxSizePages", XMS_MAILBOX_SIZE);
	await maybeAllocXmsMem(meta, "xmsScratchAddrPages", "xmsScratchSizePages", XMS_SCRATCH_SIZE);
	await maybeAllocXmsMem(meta, "xmsCodeAddrPages", "xmsCodeSizePages", codeSize);
	await maybeAllocXmsMem(meta, "xmsDataAddrPages", "xmsDataSizePages", dataSize);
	await api.writeMem(lowMemAddr, lowMemHeader.encode(meta));
	MetaAddr = lowMemAddr;
	return meta;
}

const STACK_SIZE = 4096;
let lowMemStackEnd;

async function preallocStack(lowMem: Buffer) {
	let existingAlloc = lowMem.indexOf(MARKER_STACK);
	let lowMemStackStart;
	if (existingAlloc > 0) {
		lowMemStackStart = existingAlloc;
	} else {
		lowMemStackStart = (await api.alloc(STACK_SIZE, "conv", "first_fit")).addr
	}
	if (lowMemStackStart + STACK_SIZE > 0xFFFF) {
		await api.free(lowMemStackStart);
		throw Error(`could not pre-allocate stack, run this before starting your game. Alloc: 0x${lowMemStackStart.toString(16)} exceeds 0xFFFF`);
	}
	await api.writeMem(lowMemStackStart, MARKER_STACK);
	console.log(`Low memory stack at 0x${lowMemStackStart.toString(16)}`);
	lowMemStackEnd = lowMemStackStart + STACK_SIZE;
}

// FIXME: this somehow turned into a mess at some point
// FIXME: this generates way too much code per hook, we should share common code between hooks
export async function Hook(signatureString: string, hookSegment: number, hookAddr: number, detourAddr: number, postDetourAddr: number, callingConv: any, lowMemAddr: number, lowMemOffset: number, meta: MemoryAllocations) {
	// Find entry point and what we are overriding 
	const DETOUR_LEN = 5; // ljmp <real ptr>, encoded as 'ea <real ptr>'
	const signature = Buffer.from(signatureString, "hex");
	const data = Buffer.from(await api.readMem(hookSegment, hookAddr, signature.byteLength));
	if (signature.length < 5) {
		throw Error("Signature must be at least 5 bytes long");
	}
	if (!data.slice(0, signature.length).equals(signature)) {
		const jmpOffset = data.readUInt16LE(1);
		const jmpSegment = data.readUInt16LE(3);
		// we override with `ljmp <real ptr>`, where real ptr points into upper memory segment matching our size
		if (data.readUInt8(0) == 0xea && jmpSegment > 0xc000 && jmpOffset < LOW_MEM_SIZE) {
			console.log(`Found pre-existing hook at 0x${hookSegment}:0x${hookAddr}, overriding`);
		} else {
			throw Error(`Signature mismatch, expected ${signatureString}, got ${data.toString('hex')}`);
		}
	}
	// yes, we need to use signature here for safely overriding existing hooks
	const instructions = disasm(signature);
	const instsToRecover = [];
	let overridenInstSize = 0;
	for (const inst of instructions) {
		// TODO: this assumes the instructions can just be moved
		// we might be able to use capstone metadata to confirm that
		instsToRecover.push(inst);
		overridenInstSize += inst.size;
		if (overridenInstSize >= DETOUR_LEN) {
			break; 
		}
	}
	const detourPadding = overridenInstSize - DETOUR_LEN;
	if (detourPadding < 0) {
		throw Error(`Signature too short - must be longer than overriden code`);
	}

	// Save original arguments
	let offset = lowMemOffset;
	const entryBlock = asm(callingConv.entry(), offset);
	offset += entryBlock.byteLength;

	// Call real detour
	const highMemAddr = meta.xmsCodeAddrPages * 4096;
	const highMemBytes = [
		highMemAddr & 0xFF,
		(highMemAddr >> 8) & 0xFF,
		(highMemAddr >> 16) & 0xFF,
		(highMemAddr >> 24) & 0xFF,
	]
	const trampoline = asm(`
		cli
		push dword ${detourAddr}
		; the PIE/GOT thunk logic doesn't seem to work prior to stack de-segmentation (but why? cs = 0 already)
		; anyhow, for now this just goes into eax (*not* ax, need upper bits zeroed)
		mov eax, ${lowMemStackEnd}
		; This instruction is so cursed that Keystone can't assemble it
		; lcall 0:(4 byte addr)
		db 0x66, 0x9A, ${highMemBytes[0]}, ${highMemBytes[1]}, ${highMemBytes[2]}, ${highMemBytes[3]}, 0x00, 0x00
		add sp, 10 ; 6 from callingConv.entry() + 4 detourAddr
		sti
	`, offset);
	offset += trampoline.byteLength;

	// Restore original arguments
	const exitBlock = asm(callingConv.exit(), offset);
	offset += exitBlock.byteLength;

	// Run code that we overrode with the hook
	const recoveredCode = Buffer.from(instsToRecover.flatMap(inst => inst.bytes));
	offset += recoveredCode.byteLength;

	// The actual code to be injected into the function
	const detour = asm(`
		ljmp ${lowMemAddr / 16}:${lowMemOffset}
		${"nop\n".repeat(detourPadding)}
	`);

	// Return back to original function
	let trampolineReturn;
	let extraPostReturn = new Uint8Array();
	if (postDetourAddr) {
		// FIXME: just glue together the whole assembly string first and then use labels
		const MAGIC_OFFSET1 = 65;
		const MAGIC_OFFSET2 = 24;
		// FIXME: this should really be a mini stack somewhere, this self-modying code mess makes it non-reentrant
		// FIXME: clobbers eax, so won't work for register-based calling conventions
		extraPostReturn = asm(`
			mov eax, [esp]
			mov cs:[${offset + MAGIC_OFFSET1}], eax
			add sp, 4
			push ${lowMemAddr / 16 * 0x10000 + offset + MAGIC_OFFSET2};
		`);
		const call = asm(`ljmp ${hookSegment}:${hookAddr + detour.length}`, offset);
		const pre = asm(callingConv.entryPostHook());
		const postDetour = asm(`
			cli
			push dword ${postDetourAddr}
			mov eax, ${lowMemStackEnd}
			; lcall 0:(4 byte addr)
			db 0x66, 0x9A, ${highMemBytes[0]}, ${highMemBytes[1]}, ${highMemBytes[2]}, ${highMemBytes[3]}, 0x00, 0x00
			add sp, 10 ; 6 from callingConv.entry() + 4 detourAddr
			sti
		`, offset);
		const post = asm(callingConv.exitPostHook());
		const retf = asm(`ljmp 0xdead:0xbeef`); // overwritten above
		trampolineReturn = Buffer.concat([call, pre, postDetour, post, retf]);
	} else {
		trampolineReturn = asm(`ljmp ${hookSegment}:${hookAddr + detour.length}`, offset);
	}

	// Perform hook
	await api.writeMem(lowMemAddr / 16, lowMemOffset, Buffer.concat([entryBlock, trampoline, exitBlock, extraPostReturn, recoveredCode, trampolineReturn]))
	await api.writeMem(hookSegment, hookAddr, detour);
	console.log(`Hooked 0x${hookSegment.toString(16)}:0x${hookAddr.toString(16)}, detour to 0x${detourAddr.toString(16)}`)
	return true;
}


function getFileName(fullPath: string): string {
	const parts = fullPath.split(/\\/);
	return parts.pop() || '';
}

export let mailbox: Mailbox;
export let elf: ElfFile;
export let memoryAllocations: MemoryAllocations;

let cachedStatus;

export async function Status(forceRefresh?) {
	if (!cachedStatus || forceRefresh) {
		await updateStatus();
	}
	return cachedStatus;
}

async function updateStatus() {
	const pointers = await api.getDosInfo();
	const lowMem = new Buffer(await api.readMem(0, 0, 1024 * 1024));
	const sda = parseSDA(lowMem, pointers.sda);
	const psp = parsePSP(lowMem, sda.currentPsp);
	const env = parseEnv(lowMem, psp.envBlock);
	const fileName = getFileName(env.executable);

	cachedStatus = {
		allocated: !!MetaAddr,
		process: fileName,
		baseSegment: sda.currentPsp / 16 + 0x10,
		lowMem: lowMem
	}
}

export async function Prepare() {
	const status = await Status();
	const lowMem = status.lowMem;
	await preallocStack(lowMem);
	// FIXME: prepMemory just needs a rewrite in general
	elf = new ElfFile(await fetchFile("inject.elf"));
	const codeSize = elf.getSectionData(".text").byteLength;
	const dataSize = elf.getSectionData(".data").byteLength + elf.getSectionData(".inject").byteLength;
	const mem = await prepMemory(lowMem, codeSize, dataSize);
	memoryAllocations = mem;
	// FIXME: reloading this is unsafe if the offsets changed and it's already hooked
	// best fix would be to explicitly stop the CPU during reloads
	await load(api, elf, mem);
	mailbox = new Mailbox(api, mem.xmsMailboxAddrPages * 4096);
	await mailbox.forceReset();
}

