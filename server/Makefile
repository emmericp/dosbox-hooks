CC        := gcc
INCLUDE   := -I lib/
WFLAGS    := -Wall -Wextra -Wno-unused-parameter
OPT       := -Os -fno-omit-frame-pointer
CFLAGS    := -std=c11 -m16 -ffreestanding -fno-stack-protector -fpie -march=i486 -masm=intel -MMD -MP ${WFLAGS} ${OPT} ${INCLUDE}
LIB_DIR   := lib
BUILD_DIR := build
SRC_DIR   := src
TARGET    := $(BUILD_DIR)/inject.elf

LD        := ld
LDFLAGS   := -m elf_i386 -q

SRCS := $(shell find $(SRC_DIR) $(LIB_DIR) -name "*.c")
OBJS := $(patsubst %.c, $(BUILD_DIR)/%.o, $(SRCS))
DEPS := $(OBJS:.o=.d)

# This is the cursed part.
# `jmp immediate` doesn't get the 0x66 prefix, but we can just add it.
# Indirect calls are even more cursed, they look like this:
#   67 ff 5c 24 2c call [DWORD PTR 44[esp]]
# That is not only missing the 0x66 prefix, but it's also a far call. Just adding the missing
# prefix turns this into a very cursed 32 bit indirect far call that reads 6 bytes from memory.
# Luckily we can just drop the "DWORD PTR" to turn it into a normal flat 32 bit call.
# `call imm` and `call reg` do the right thing by default.
$(BUILD_DIR)/%.s: %.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -S $< -o $@	
	@sed -i -E 's/\b(jmp|j[a-z]{1,4})(\t[^eE])/data32 \1\2/' $@
	@sed -i -E 's/\b(call\t\[)DWORD PTR /\1/' $@
# Needs https://github.com/dosbox-staging/dosbox-staging/pull/4775
	@sed -i -E 's/\lock //' $@

$(BUILD_DIR)/%.o: $(BUILD_DIR)/%.s
	$(CC) $(CFLAGS) -c $< -o $@

$(TARGET): $(OBJS) linker.ld
	$(LD) $(LDFLAGS) $(OBJS) -T linker.ld -Map=$(TARGET).map -o $@

-include $(shell find $(BUILD_DIR) -name "*.d" 2> /dev/null)

clean:
	rm -rf $(BUILD_DIR)

all: $TARGET

.PHONY: all clean
