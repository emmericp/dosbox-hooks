#include <stdint.h>

#include "log.h"
#include "mailbox.h"

typedef enum {
	MSG_RNG_MAIN = 1
} roa1_msg_t;

typedef struct rng_msg_t {
	int16_t orig_arg;
	int16_t result;
} rng_msg_t;

int16_t last_random_call_arg;

void hook_random_pre(int16_t* arg, int16_t arglen) {
	LOG_DEBUG("called random(%d)", *arg);
	last_random_call_arg = *arg;
}

int16_t fake_random_val_100;
int16_t fake_random_val_20;
int16_t fake_random_val_6;

void hook_random_post(int16_t* ret_arg, int16_t arglen) {
	int16_t orig_ret = *ret_arg;
	if (last_random_call_arg == 100 && fake_random_val_100) {
		*ret_arg = fake_random_val_100;
	} else if (last_random_call_arg == 20 && fake_random_val_20) {
		*ret_arg = fake_random_val_20;
	} else if (last_random_call_arg == 6 && fake_random_val_6) {
		*ret_arg = fake_random_val_6;
	}
	LOG_DEBUG("random(%d) = %d, returning %d", last_random_call_arg, orig_ret, *ret_arg);
	rng_msg_t msg = {
		.orig_arg = last_random_call_arg,
		.result = *ret_arg
	};
	mailbox_send(MSG_RNG_MAIN, &msg, sizeof(msg));
}
