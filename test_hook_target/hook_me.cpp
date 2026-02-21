#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <dos.h>
#include <conio.h>

typedef struct {
	uint16_t val1;
	uint16_t val2;
} ptr_test_t;

int __cdecl cdecl4222(ptr_test_t* ptr_test, int16_t num1, int16_t num2, int16_t num3, int16_t num4) {
	printf("  cdecl42222(): %p (%d, %d), %d, %d, %d, %d", ptr_test, ptr_test->val1, ptr_test->val2, num1, num2, num3, num4);
	return num1 + num2 + num3 + num4;
}

void __fastcall fastcall4222(ptr_test_t* ptr_test, int16_t num1, int16_t num2, int16_t num3, int16_t num4) {
	printf("fastcall4222(): %p (%d, %d), %d, %d, %d, %d\n", ptr_test, ptr_test->val1, ptr_test->val2, num1, num2, num3, num4);
}

void __watcall watcall4222(ptr_test_t* ptr_test, int16_t num1, int16_t num2, int16_t num3, int16_t num4) {
	printf(" watcall4222(): %p (%d, %d), %d, %d, %d, %d\n", ptr_test, ptr_test->val1, ptr_test->val2, num1, num2, num3, num4);
}

int main(int argc, char *argv[]) {
    if (argc < 5) {
        puts("Usage: hook_me <val1> <val2> <va3> <val4>\n");
        return 1;
    }

    int16_t num1 = atoi(argv[1]);
    int16_t num2 = atoi(argv[2]);
	int16_t num3 = atoi(argv[3]);
	int16_t num4 = atoi(argv[4]);

	ptr_test_t* ptr_test = (ptr_test_t*)malloc(sizeof(ptr_test_t));
	ptr_test->val1 = num1 + num2;
	ptr_test->val2 = num3 + num4;

    while (!kbhit()) {
		int func1_ret = cdecl4222(ptr_test, num1, num2, num3, num4);
		printf(" = %d\n", func1_ret);
		fastcall4222(ptr_test, num1, num2, num3, num4);
		watcall4222(ptr_test, num1, num2, num3, num4);
        puts("\n");
        delay(500); 
    }

    return 0;
}

