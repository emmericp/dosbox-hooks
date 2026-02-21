#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stdatomic.h>

static inline bool try_lock(_Atomic volatile uint8_t* lock) {
	uint8_t expected = 0;
	atomic_compare_exchange_weak(lock, &expected, 1);
	return expected == 0 || expected == 1;
}

static inline void acquire_lock(_Atomic volatile uint8_t* lock, _Atomic uint32_t* contention_count) {
	// A tight loop is good enough, but it would be best to abort the current
	// emulation loop.
	while (!try_lock(lock)) {
		contention_count++;
	}
}
