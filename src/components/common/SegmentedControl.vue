<script setup lang="ts" generic="Value extends string">
defineProps<{
  legend: string
  name: string
  options: ReadonlyArray<{ value: Value; label: string }>
}>()

const selected = defineModel<Value>({ required: true })
</script>

<template>
  <fieldset class="segmented">
    <legend class="segmented__legend">{{ legend }}</legend>
    <div class="segmented__options">
      <label
        v-for="option in options"
        :key="option.value"
        class="segmented__option"
        :class="{ 'segmented__option--on': selected === option.value }"
      >
        <input
          v-model="selected"
          class="segmented__input"
          type="radio"
          :name="name"
          :value="option.value"
        />
        {{ option.label }}
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.segmented {
  margin: 0;
  padding: 0;
  border: 0;
}

.segmented__legend {
  padding: 0 0 6px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-dim);
}

.segmented__options {
  display: flex;
  gap: 1px;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  background: var(--hairline);
  overflow: hidden;
}

.segmented__option {
  padding: 8px 16px;
  font-size: 14px;
  background: var(--ink);
  color: var(--fg-dim);
  cursor: pointer;
}

.segmented__option--on {
  background: rgba(30, 215, 96, 0.12);
  color: var(--green);
}

.segmented__option:focus-within {
  outline: 2px solid var(--green);
  outline-offset: -2px;
}

.segmented__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
</style>
