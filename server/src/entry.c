#include <stdint.h>

#include "pointer.h"

__attribute__((section(".inject")))
// Use this as a buffer to call stuff in low memory
void* low_mem_area;


typedef void hook_func(void* arg_ptr, uint16_t arg_len);

#include "unreal_mode.h"
void __attribute__((cdecl)) enter(hook_func* target, uint16_t arg_len, far_ptr_t args) {
	enable_unreal();
	uint32_t* arg_ptr = flat_ptr(args);
	target(arg_ptr, arg_len);
}

// FIXME: stack switching isn't reentrant
void __attribute__((section(".text.entry"))) __attribute__((naked)) enter_raw() {
	__asm__(
		// eax = new stack_end
		// old stack: save ds
		// "push/pop <segment>" generate warnings about how the behavior
		// changed from 16 to 32 bit recently. But you also can't add
		// a data16 or data32 prefix because both are errors...
		".byte 0x1e;" // push ds (2 byte)
		// ds, es = 0
		"xor cx, cx;"
		"mov ds, cx;"
		"mov es, cx;"
		// push sp and ss onto new stack
		"mov word ptr [eax - 2], sp;"
		"mov word ptr [eax - 4], ss;"

		// switch to new stack
		"mov ss, cx;"
		"mov sp, ax;"
		"sub sp, 4;"

		// Callee-saved registers
		"push ebp;"
		"mov ebp, esp;"
		"push ebx;"
		"push esi;"
		"push edi;"

		// we still need to get arguments from the old stack
		"movzx ebp, word ptr [eax - 4];"
		"movzx edx, word ptr [eax - 2];"
		"shl ebp, 4;"
		"add ebp, edx;"
		"push eax;"


		// Call entry function
		// old: 2 byte saved ds, 8 byte return addr, 4 byte target, 2 byte arglen, 4 byte arg far ptr
		"push dword ptr [ebp + 16];" // arg segment
		"push cx;"                   // padding
		"push  word ptr [ebp + 14];" // arg len
		"push dword ptr [ebp + 10];" // target
		"call enter;"
		"add esp, 12;"
		
		// Restore registers
		"pop eax;" // eax <- new stack end
		"pop edi;"
		"pop esi;"
		"pop ebx;"
		"pop ebp;"
		// Back to old stack
		"mov ss, word ptr [eax - 4];"
		"mov sp, word ptr [eax - 2];"
		".byte 0x1f;" // pop ds
		"retf;"
	);
}
