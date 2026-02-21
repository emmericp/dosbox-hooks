export interface CallingConvention {
	// Returns assembly code to be run immediately after `ljmp $detour`
	// This function must push a total of 6 bytes onto the stack:
	// 1. far pointer to the original arguments
	// 2. the total length in bytes of the arguments
	// The arguments are expected to be in 16 bit cdecl calling convention.
	entry(): string
	// Returns assembly code to be run before jumping back to the hooked function.
	// For register-based calling conventions it also must copy back the arguments moved in entry() into the registers.
	exit(): string

	entryPostHook(): string
	exitPostHook(): string
}

function padSize16(size: number) {
	return Math.ceil(size / 2) * 2
}

export class CDecl16 implements CallingConvention {
	private readonly size: number;

	// Argument sizes of the hook target in bytes
	constructor(...args: number[]) {
		this.size = args.reduce((acc, x) => acc + padSize16(x));
	}

	public entry() {
		return `
			push bp
			mov bp, sp
			lea ax, [bp + 6]
			push ss
			push ax
			push word ${this.size}
		`
	}

	public exit() {
		return `
			pop bp
		`
	}

	public entryPostHook() {
		return `
			push dx
			push ax
			push ss
			push bp
			mov bp, sp
			lea ax, [bp + 4]
			pop bp
			push ax
			push word 4
		`
	}

	public exitPostHook() {
		return `
			pop ax
			pop dx
		`
	}
}

// The code below is 80% AI generated, I have no clue if it's correct in general.
// But it does work for the example app. How fastcall handles 32 bit values needs to be double-checked.

// Helper type for mapping arguments to locations
type ArgLocation = 
    | { type: 'reg', reg: string, originalIndex: number }
    | { type: 'stack', offset: number, originalIndex: number }

/**
 * Base class for Register-based conventions (Watcall, Fastcall).
 * Treats arguments as a stream of 16-bit words.
 */
abstract class RegisterConvention implements CallingConvention {
    private readonly size: number;
    private readonly mapping: ArgLocation[] = [];

    constructor(registers: string[], reverse: boolean, joinRegisters: boolean, ...args: number[]) {
		this.size = args.reduce((acc, x) => acc + padSize16(x), 0);
		
		const availableRegs = [...registers];
		const stackArgs: { words: number, originalIndex: number }[] = [];
		const regArgs: { reg: string, originalIndex: number }[] = [];
		
		// 1. First Pass: Determine what fits in registers vs stack
		for (let argIdx = 0; argIdx < args.length; argIdx++) {
			const words = padSize16(args[argIdx]) / 2;

			// FIXME: is this even correct in general?
			// at least for the watcom example it ignores the pointer
			if (words > 1 && !joinRegisters) {
				stackArgs.push({ words: words, originalIndex: argIdx });
				continue;
			}
			
			// Note: Register conventions usually require the WHOLE argument 
			// to fit in remaining registers. If a 'long' (2 words) only has 
			// 1 reg left, the whole 'long' usually goes to the stack.
			if (availableRegs.length >= words) {
				for (let i = 0; i < words; i++) {
					regArgs.push({ reg: availableRegs.shift()! , originalIndex: argIdx});
				}
			} else {
				// This argument (or what's left of the registers) goes to stack
				stackArgs.push({ words: words, originalIndex: argIdx });
				// Clear remaining regs so subsequent args don't jump back into regs
				availableRegs.length = 0; 
			}
		}

		// 2. Second Pass: Handle Stack Offsets
		// If reverse is true (Watcall), the last stack arg is at the lowest offset.
		if (reverse) {
			stackArgs.reverse();
		}

		let currentStackOffset = 0;
		for (const sArg of stackArgs) {
			for (let i = 0; i < sArg.words; i++) {
				this.mapping.push({ 
					type: 'stack', 
					offset: currentStackOffset,
					originalIndex: sArg.originalIndex
				});
				currentStackOffset += 2;
			}
		}
		for (const rArg of regArgs) {
			this.mapping.push({
				type: "reg",
				reg: rArg.reg,
				originalIndex: rArg.originalIndex
			})
		}
		this.mapping.sort((a, b) => a.originalIndex - b.originalIndex);
    }

    public entry() {
        const lines: string[] = [];
		lines.push('push si');

        // 1. Standard stack frame setup
        lines.push('push bp');
        lines.push('mov bp, sp');

        // 2. Build the contiguous Cdecl buffer on the local stack.
        // Cdecl pushes Right-to-Left (High Address to Low Address).
        // To build [Arg0][Arg1] on the stack, we must Push ArgN... then Arg0.
        for (let i = this.mapping.length - 1; i >= 0; i--) {
            const loc = this.mapping[i];
            
            if (loc.type === 'reg') {
                // If it was passed in a register, push that register
                lines.push(`push ${loc.reg}`);
            } else {
                lines.push(`mov si, [bp + ${8 + loc.offset}]`);
                lines.push(`push si`);
            }
        }

        // 3. Prepare the hook interface (6 bytes)
        // At this point, SP points to the start of our contiguous arguments (Arg0).
        lines.push('mov ax, sp');       // 1. Far Pointer (Offset)
        lines.push('push ss');          // 1. Far Pointer (Segment)
		lines.push('push ax');
        lines.push(`push word ${this.size}`); // 2. Total length
        
        return lines.join('\n');
    }

    public exit() {
        const lines: string[] = [];

        // 1. Write-Back Phase
        // The hook may have modified the memory we passed it.
        // We must pop values back into their original locations.
        // Stack is currently: [Arg0] [Arg1] ... (SP is at Arg0)
        
        for (let i = 0; i < this.mapping.length; i++) {
            const loc = this.mapping[i];

            if (loc.type === 'reg') {
                // Restore modified value to register
                lines.push(`pop ${loc.reg}`);
            } else {
                // Restore modified value to original stack location
                lines.push(`pop si`);
                lines.push(`mov [bp + ${8 + loc.offset}], si`);
            }
        }

        // 2. Cleanup
        lines.push('pop bp');
		lines.push('pop si');
        
        return lines.join('\n');
    }

	public entryPostHook(): string {
		throw Error("post hooks are NYI for register-based calling conventions");
	}
	
	public exitPostHook(): string {
		throw Error("post hooks are NYI for register-based calling conventions");
	}
}

/**
 * Watcom Register Calling Convention (Watcall)
 * Passes first 4 words in AX, DX, BX, CX. Remaining on stack.
 */
export class Watcall16 extends RegisterConvention {
    constructor(...args: number[]) {
        super(['ax', 'dx', 'bx', 'cx'], false, true, ...args);
    }
}

/**
 * Borland/Microsoft Fastcall 16-bit
 * Commonly passes first 3 words in AX, DX, BX. Remaining on stack.
 */
export class Fastcall16 extends RegisterConvention {
    constructor(...args: number[]) {
        super(['ax', 'dx', 'bx'], false, false, ...args);
    }
}