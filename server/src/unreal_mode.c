#include <stdint.h>

// FIXME: entering protected mode is a mess with the default dosbox settings

typedef struct {
	uint16_t limit_low;
	uint16_t base_low;
	uint8_t  base_middle;
	uint8_t  access;
	uint8_t  flags_limit;
	uint8_t  base_high;
} __attribute__((packed)) gdt_entry_t;

typedef struct {
    uint16_t limit;
    gdt_entry_t* base;
} __attribute__((packed)) gdt_ptr_t;

gdt_entry_t unreal_gdt[2] = {
	{ 0, 0, 0, 0, 0, 0 },
	{
		.limit_low    = 0xFFFF,
		.base_low     = 0x0000,
		.base_middle  = 0x00,
		.access       = 0x92,       // 10010010b: Present, Ring 0, Data, Writable
		.flags_limit  = 0xCF,       // 11001111b: G=1 (4KB units), Sz=0 (16-bit), + Limit bits 16-19
		.base_high    = 0x00
    }
};

gdt_ptr_t gdt_ptr = {
    .limit = sizeof(unreal_gdt) - 1,
    .base  = &unreal_gdt[0] // yes, this is relocated correctly on load
};

// Makes the stack segment 32 bit large, the other segments don't check that restriction anyways
void enable_unreal() {
	__asm__(
		"data32 lgdt [eax];"
		"mov eax, cr0;"
		"or al, 1;"
		"mov cr0, eax;"
		"mov bx, 8;"
		"mov ss, bx;"
		"and al, 0xFE;"
		"mov cr0, eax;"
		:
		: "a"(&gdt_ptr)
		: "memory", "ebx"
	);
}
