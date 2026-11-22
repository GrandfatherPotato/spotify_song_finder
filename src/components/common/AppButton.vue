<script lang="ts">
export const BUTTON_VARIANT = {
  primary: 'primary',
  ghost: 'ghost',
  danger: 'danger',
} as const

export type ButtonVariant = (typeof BUTTON_VARIANT)[keyof typeof BUTTON_VARIANT]

export const BUTTON_SIZE = {
  small: 'small',
  medium: 'medium',
} as const

export type ButtonSize = (typeof BUTTON_SIZE)[keyof typeof BUTTON_SIZE]

export const BUTTON_TYPE = {
  button: 'button',
  submit: 'submit',
} as const

export type ButtonType = (typeof BUTTON_TYPE)[keyof typeof BUTTON_TYPE]

export interface AppButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  type?: ButtonType
}
</script>

<script setup lang="ts">
withDefaults(defineProps<AppButtonProps>(), {
  variant: BUTTON_VARIANT.ghost,
  size: BUTTON_SIZE.small,
  type: BUTTON_TYPE.button,
})
</script>

<template>
  <!-- `disabled` and the rest fall through to the real button as attributes. -->
  <button :type="type" class="button" :class="[`button--${variant}`, `button--${size}`]">
    <slot />
  </button>
</template>

<style scoped>
.button {
  font: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
}

.button:focus-visible {
  outline: 2px solid var(--green, #1ed760);
  outline-offset: 3px;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.button--small {
  font-size: 13px;
  padding: 8px 18px;
}

.button--medium {
  font-size: 15px;
  font-weight: 600;
  padding: 12px 26px;
}

.button--primary {
  font-weight: 600;
  color: var(--ink, #0a0c0a);
  background: var(--green, #1ed760);
}

.button--primary:hover:not(:disabled) {
  background: #25f06d;
}

.button--ghost {
  color: var(--fg, #e9ede6);
  background: transparent;
  border-color: var(--hairline, rgba(232, 236, 230, 0.1));
}

.button--ghost:hover:not(:disabled) {
  border-color: var(--green, #1ed760);
}

.button--danger {
  color: var(--fg, #e9ede6);
  background: transparent;
  border-color: var(--hairline, rgba(232, 236, 230, 0.1));
}

.button--danger:hover:not(:disabled) {
  color: #f6b3a6;
  border-color: #f0624a;
}
</style>
