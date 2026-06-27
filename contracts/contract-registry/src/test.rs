#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, Symbol};

fn setup(env: &Env) -> (Address, Address, Address) {
    let admin = Address::generate(env);
    let caller = Address::generate(env);
    let contract_id = env.register_contract(None, ContractRegistry);
    let client = ContractRegistryClient::new(env, &contract_id);
    client.initialize(&admin, &3);
    (admin, caller, contract_id)
}

#[test]
fn test_register_contract_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, caller, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    assert!(matches!(
        client.try_register_contract(&caller, &Symbol::new(&env, "demo")),
        Err(Ok(Error::Unauthorized))
    ));
}

#[test]
fn test_update_contract_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, caller, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    assert!(matches!(
        client.try_update_contract(&caller, &Symbol::new(&env, "demo")),
        Err(Ok(Error::Unauthorized))
    ));
}

#[test]
fn test_deregister_contract_allows_admin_or_registrant() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _caller, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);
    let contract_symbol = Symbol::new(&env, "demo");

    client.register_contract(&admin, &contract_symbol);
    client.deregister_contract(&admin, &contract_symbol);
}

#[test]
fn test_submit_event_respects_max_events_cap() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    client.submit_event(&admin, &Symbol::new(&env, "one"));
    client.submit_event(&admin, &Symbol::new(&env, "two"));
    client.submit_event(&admin, &Symbol::new(&env, "three"));
    assert!(matches!(
        client.try_submit_event(&admin, &Symbol::new(&env, "four")),
        Err(Ok(Error::MaxEventsReached))
    ));
}

#[test]
fn test_pause_and_unpause_admin_only() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _, contract_id) = setup(&env);
    let client = ContractRegistryClient::new(&env, &contract_id);

    client.pause(&admin);
    assert!(matches!(
        client.try_submit_event(&admin, &Symbol::new(&env, "blocked")),
        Err(Ok(Error::ContractPaused))
    ));
    client.unpause(&admin);
}
