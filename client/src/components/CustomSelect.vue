<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

const props = defineProps<{
  modelValue: string;
  options: { value: string; label: string }[];
  variant?: 'default' | 'ghost';
  placement?: 'left' | 'right';
}>();

const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

const closeDropdown = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => document.addEventListener('click', closeDropdown));
onUnmounted(() => document.removeEventListener('click', closeDropdown));

const selectOption = (val: string) => {
  emit('update:modelValue', val);
  isOpen.value = false;
};
</script>

<template>
  <div class="relative text-left" :class="variant === 'ghost' ? 'inline-block' : 'block w-full'" ref="dropdownRef">
    <button 
      type="button" 
      @click="isOpen = !isOpen"
      :class="variant === 'ghost' ? 'text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 flex items-center gap-1 font-medium' : 'w-full flex justify-between items-center bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 transition-colors'"
    >
      <span class="truncate">{{ options.find(o => o.value === modelValue)?.label || modelValue }}</span>
      <ChevronDown class="w-3.5 h-3.5 opacity-70 shrink-0" />
    </button>

    <Transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <div 
        v-if="isOpen"
        class="absolute z-50 mt-1 max-h-64 overflow-y-auto w-full min-w-[120px] origin-top rounded-xl bg-white dark:bg-gray-800 shadow-xl ring-1 ring-black/5 dark:ring-white/10 focus:outline-none custom-scrollbar"
        :class="placement === 'right' ? 'right-0' : 'left-0'"
      >
        <div class="py-1">
          <button
            v-for="option in options"
            :key="option.value"
            @click="selectOption(option.value)"
            class="block w-full text-left px-3 py-2 text-xs transition-colors"
            :class="option.value === modelValue ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-semibold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
