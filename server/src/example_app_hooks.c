#include <stdint.h>
#include <stdatomic.h>
#include <stdbool.h>

#include "log.h"
#include "pointer.h"
#include "log.h"

typedef enum {
	MSG_DEMO1 = 1,
	MSG_DEMO2 = 2,
	MSG_DEMO3 = 3,
} example_app_msg_t;

typedef struct {
	bool before_change;
	uint16_t args[4];
	uint16_t ptr_args[2];
} demo_msg_t;

typedef struct {
	uint16_t val1;
	uint16_t val2;
} example_struct_t;

typedef struct {
	far_ptr_t ptr_arg;
	uint16_t num1;
	uint16_t num2;
	uint16_t num3;
	uint16_t num4;
} example_app_args_t;

void log_hook_args(example_app_msg_t which, bool before_change, example_app_args_t* args) {
	example_struct_t* ptr_arg = (example_struct_t*) flat_ptr(args->ptr_arg);
	demo_msg_t msg = {
		.before_change = before_change,
		.args = {args->num1, args->num2, args->num3, args->num4},
		.ptr_args = {ptr_arg->val1, ptr_arg->val2},
	};
	mailbox_send(which, &msg, sizeof(msg));
}

_Atomic uint16_t add_to_num1 = 1;
_Atomic uint16_t add_to_num2 = 2;
_Atomic uint16_t add_to_num3 = 3;
_Atomic uint16_t add_to_num4 = 4;
_Atomic uint16_t add_to_ptr1 = 10;
_Atomic uint16_t add_to_ptr2 = 20;
_Atomic uint16_t func1_ret_multiplier = 10;

void change_args(example_app_args_t* args) {
	example_struct_t* ptr_arg = (example_struct_t*) flat_ptr(args->ptr_arg);
	ptr_arg->val1 += add_to_ptr1;
	ptr_arg->val2 += add_to_ptr2;
	args->num1 += add_to_num1;
	args->num2 += add_to_num2;
	args->num3 += add_to_num3;
	args->num4 += add_to_num4;
}

void hook_func1(example_app_args_t* args, uint16_t arglen) {
	LOG_DEBUG("func1 hook called");
	log_hook_args(1, true, args);
	change_args(args);
	log_hook_args(1, false, args);
}

// FIXME: it would be so much nicer to also have the original arguments accessible here
// since this currently only works for cdecl anyways you can get them: they are at return_arg + 4 bytes (regardless of arglen)
// but it's of course not guaranteed that they are unchanged...
void hook_post_func1(uint16_t* return_arg, uint16_t arglen) {
	uint16_t new_return = *return_arg * func1_ret_multiplier;
	LOG_DEBUG("hook_post_func1: returning %d, changing to %d", *return_arg, new_return);
	*return_arg = new_return;
}


void hook_func2(example_app_args_t* args, uint16_t arglen) {
	LOG_DEBUG("func2 hook called");
	log_hook_args(2, true, args);
	change_args(args);
	log_hook_args(2, false, args);
}

void hook_func3(example_app_args_t* args, uint16_t arglen) {
	LOG_DEBUG("func3 hook called");
	log_hook_args(3, true, args);
	change_args(args);
	log_hook_args(3, false, args);
}
