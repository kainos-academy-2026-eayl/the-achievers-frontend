output "resource_group_name" {
  description = "The name of the Azure resource group."
  value       = azurerm_resource_group.frontend.name
}

output "resource_group_id" {
  description = "The Azure resource ID of the resource group."
  value       = azurerm_resource_group.frontend.id
}

output "resource_group_location" {
  description = "The Azure region assigned to the resource group."
  value       = azurerm_resource_group.frontend.location
}