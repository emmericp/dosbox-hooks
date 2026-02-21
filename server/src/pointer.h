#pragma once

#include <stdint.h>

typedef struct {
	uint16_t offset;
	uint16_t segment;
} far_ptr_t;

static void* flat_ptr(far_ptr_t far_ptr) {
	return (void*)(far_ptr.segment * 16 + far_ptr.offset);
}
