OUTPUT_FORMAT("elf32-i386")
SECTIONS
{
    . = 0;
    .text : {
        *(.text.entry)
        *(.text .text.*)
    }
	# Just to make the .map file more readable
	. = 0x10000000;
    .data : ALIGN(4) {
		_GLOBAL_OFFSET_TABLE_ = .;
		*(.got .got.*) 
		*(.data .data.*)
		*(.rodata .rodata.*)
		*(.bss .bss.*)
		*(COMMON)
	}
	.inject : ALIGN(4) {
		*(.inject)
	}
	.eh_frame : ALIGN(4) {
        *(.eh_frame)
	}

    .reloc : ALIGN(4) {
        *(.rel.*)
    }
}
