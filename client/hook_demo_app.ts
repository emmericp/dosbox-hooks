import { MemoryAllocations, Hook, MetaAddr, elf, memoryAllocations } from "./main";
import { CDecl16, Watcall16, Fastcall16 } from "./callingconvention";


// FIXME: add some reasonably nice wrapper around hooking and loaded binaries
export async function HookDemoApp(baseSegment: number) {
	// FIXME: memory management for the meta block instead of hard-coding offsets
	await Hook("5589e58b5e06", baseSegment, 0x00, elf.getFinalSymbolLocation("hook_func1"), elf.getFinalSymbolLocation("hook_post_func1"), new CDecl16(4, 2, 2, 2, 2), MetaAddr, 0x40, memoryAllocations);
	await Hook("565589e58b7608", baseSegment, 0x32, elf.getFinalSymbolLocation("hook_func2"), null, new Fastcall16(4, 2, 2, 2, 2), MetaAddr, 0x40 + 0x100, memoryAllocations);
	await Hook("565589e589c6", baseSegment, 0x5a, elf.getFinalSymbolLocation("hook_func3"), null, new Watcall16(4, 2, 2, 2, 2), MetaAddr, 0x40 + 0x100 +0x50, memoryAllocations);
}
